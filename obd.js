/* ═══════════════════════════════════════════════════════════════════════
   READ FROM CAR — OBD-II ethanol & fuel-level readout from the browser

   Two transports, one ELM327 conversation:

     • Web Bluetooth — Bluetooth LE adapters (Veepeak BLE, vLinker MC+,
       OBDLink CX…). Android + desktop Chrome/Edge.
     • Web Serial — Bluetooth *Classic* adapters (OBDLink MX+, most cheap
       ELM327s) via the COM port Windows/macOS creates when you pair them,
       plus USB cables. Desktop Chrome/Edge only.

   Reads two standard Mode-01 PIDs and fills the calculator:

     0x52  Ethanol fuel %      (A × 100 / 255) — flex-fuel vehicles
     0x2F  Fuel tank level %   (A × 100 / 255)

   iOS has neither API, so the whole block never renders there.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Response parsing (pure — unit-tested in Node) ────────────────────── */

/**
 * Extract the data byte for a Mode-01 PID from raw ELM327 output.
 *
 * Adapter output is line-based hex text and can include echoes ("0152"),
 * "SEARCHING...", CAN headers ("7E8 03 41 52 A3"), multi-ECU replies, and
 * arbitrary spacing. A positive response to PID `pp` contains "41 pp A…";
 * we scan for that pattern anywhere and return byte A (0–255), or null on
 * "NO DATA" / errors / negative responses.
 */
function extractPidByte(raw, pid) {
  if (!raw) return null;
  const want = `41${pid.toUpperCase()}`;
  for (const line of String(raw).toUpperCase().split(/[\r\n]+/)) {
    const hex = line.replace(/[^0-9A-F]/g, "");
    // Skip pure echoes of the request ("0152") and too-short lines.
    const at = hex.indexOf(want);
    if (at !== -1 && hex.length >= at + want.length + 2) {
      return parseInt(hex.slice(at + want.length, at + want.length + 2), 16);
    }
  }
  return null;
}

/** Scale an OBD percentage byte (0–255) to 0–100, one decimal. */
function decodePct(byte) {
  return byte == null ? null : Math.round((byte * 1000) / 255) / 10;
}

/* ── Browser side ─────────────────────────────────────────────────────── */
(function () {
  if (typeof module !== "undefined") {
    module.exports = { extractPidByte, decodePct };
    return;
  }

  const hasBle = "bluetooth" in navigator;
  const hasSerial = "serial" in navigator;
  if (!hasBle && !hasSerial) return; // block stays hidden

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let busy = false;
  let bleDevice = null; // remembered across reads this session

  function setStatus(msg, cls) {
    const el = $("obd-status");
    el.className = `obd-status ${cls || ""}`;
    el.textContent = msg;
  }

  /* ── Shared command/response engine: send, accumulate until ">" ────── */
  function makeTurnEngine(writeBytes) {
    let buffer = "";
    let resolveTurn = null;

    function feed(text) {
      buffer += text;
      if (buffer.includes(">") && resolveTurn) {
        const out = buffer;
        buffer = "";
        const r = resolveTurn;
        resolveTurn = null;
        r(out);
      }
    }

    async function send(cmd, timeoutMs = 6000) {
      buffer = "";
      const turn = new Promise((resolve, reject) => {
        resolveTurn = resolve;
        setTimeout(() => {
          if (resolveTurn) {
            resolveTurn = null;
            reject(new Error("timeout"));
          }
        }, timeoutMs);
      });
      await writeBytes(enc.encode(`${cmd}\r`));
      return turn;
    }

    return { feed, send };
  }

  /* ── Transport: Bluetooth LE ───────────────────────────────────────── */

  /* GATT UART candidates, most common OBD BLE adapters first:
     FFF0/FFF1/FFF2 (Veepeak, vLinker), FFE0/FFE1 (HM-10 clones),
     Nordic UART (OBDLink CX and friends). */
  const UART_CANDIDATES = [
    { service: 0xfff0, write: 0xfff2, notify: 0xfff1 },
    { service: 0xffe0, write: 0xffe1, notify: 0xffe1 },
    {
      service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
      write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
      notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
    },
  ];

  async function connectBle() {
    if (!bleDevice || !bleDevice.gatt) {
      bleDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: UART_CANDIDATES.map((c) => c.service),
      });
    }
    const server = await bleDevice.gatt.connect();

    let uart = null;
    for (const c of UART_CANDIDATES) {
      try {
        const svc = await server.getPrimaryService(c.service);
        const write = await svc.getCharacteristic(c.write);
        const notify = await svc.getCharacteristic(c.notify);
        uart = { write, notify };
        break;
      } catch { /* try the next known layout */ }
    }
    if (!uart) throw new Error("unsupported-adapter");

    const engine = makeTurnEngine(async (bytes) => {
      if (uart.write.properties.writeWithoutResponse) {
        await uart.write.writeValueWithoutResponse(bytes);
      } else {
        await uart.write.writeValue(bytes);
      }
    });
    uart.notify.addEventListener("characteristicvaluechanged", (e) =>
      engine.feed(dec.decode(e.target.value))
    );
    await uart.notify.startNotifications();

    return { send: engine.send, close: () => bleDevice.gatt.disconnect() };
  }

  /* ── Transport: serial COM port (classic-BT pairings & USB cables) ─── */
  async function connectSerial() {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 }); // RFCOMM ignores baud; USB ELMs use it
    const writer = port.writable.getWriter();
    const reader = port.readable.getReader();
    const engine = makeTurnEngine((bytes) => writer.write(bytes));

    let alive = true;
    (async () => {
      try {
        while (alive) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) engine.feed(dec.decode(value));
        }
      } catch { /* pump ends when the port closes */ }
    })();

    return {
      send: engine.send,
      close: async () => {
        alive = false;
        try { await reader.cancel(); } catch { /* already closed */ }
        try { reader.releaseLock(); } catch { /* already released */ }
        try { writer.releaseLock(); } catch { /* already released */ }
        try { await port.close(); } catch { /* already closed */ }
      },
    };
  }

  /* ── The shared session: init adapter, read PIDs, fill the form ────── */
  function applyReading(id, pct) {
    const input = $(id);
    input.value = Math.round(pct);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function readCar(transport) {
    if (busy) return;
    busy = true;
    const buttons = [$("obd-btn"), $("obd-serial-btn")].filter(Boolean);
    buttons.forEach((b) => (b.disabled = true));
    let link = null;

    try {
      setStatus(
        transport === "serial"
          ? "Pick the adapter's COM port… (MX+ pairings show two — outgoing is usually the lower number)"
          : "Choose your OBD adapter…",
        "busy"
      );
      link = transport === "serial" ? await connectSerial() : await connectBle();

      setStatus("Waking the adapter…", "busy");
      await link.send("ATZ", 10000);
      await link.send("ATE0");        // echo off
      await link.send("ATL0");        // linefeeds off
      await link.send("ATSP0");       // auto protocol

      setStatus("Talking to the ECU…", "busy");
      const eth = decodePct(extractPidByte(await link.send("0152", 12000), "52"));
      const lvl = decodePct(extractPidByte(await link.send("012F", 8000), "2F"));

      const got = [];
      if (eth != null) { applyReading("current-eth", eth); got.push(`tank mix E${Math.round(eth)}`); }
      if (lvl != null) { applyReading("fuel-level", lvl); got.push(`fuel level ${Math.round(lvl)}%`); }

      if (!got.length) {
        setStatus("Connected, but this car doesn't report ethanol or fuel level over OBD — use the tube tester instead.", "warn");
      } else if (eth == null) {
        setStatus(`Pulled ${got.join(" + ")} from the ECU. No ethanol PID — this car likely isn't flex-fuel; use the tube tester for the mix.`, "warn");
      } else {
        setStatus(`Pulled ${got.join(" + ")} from the ECU. If you just filled up, drive a few miles and re-read — the ECU learns the new blend gradually.`, "ok");
      }
    } catch (err) {
      if (transport !== "serial") bleDevice = null; // fresh chooser next time
      if (err && err.name === "NotFoundError") {
        setStatus("", ""); // user closed the chooser — not an error
      } else if (err && err.message === "unsupported-adapter") {
        setStatus("That device doesn't answer like a BLE ELM327. Classic-Bluetooth adapters (OBDLink MX+…) don't do BLE — pair it in your OS's Bluetooth settings, then use PAIRED / SERIAL ADAPTER below.", "warn");
      } else if (err && err.message === "timeout") {
        setStatus(
          transport === "serial"
            ? "No answer on that COM port — Bluetooth pairings create two; try the other one (ignition on)."
            : "The adapter stopped responding — check it's seated in the OBD port and the ignition is on, then try again.",
          "warn"
        );
      } else if (transport === "serial" && err && err.name === "InvalidStateError") {
        setStatus("That COM port is busy — close any other OBD software using the adapter and try again.", "warn");
      } else {
        setStatus("Couldn't connect. Make sure the adapter is powered (ignition on) and in range, then try again.", "warn");
      }
    } finally {
      try { if (link) await link.close(); } catch { /* already gone */ }
      buttons.forEach((b) => (b.disabled = false));
      busy = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("obd-reader").hidden = false;

    const bleBtn = $("obd-btn");
    const serialBtn = $("obd-serial-btn");

    if (hasBle) {
      bleBtn.addEventListener("click", () => readCar("ble"));
    } else {
      // No BLE (rare on desktop) — promote serial to the primary button.
      bleBtn.addEventListener("click", () => readCar("serial"));
    }

    if (hasSerial && hasBle) {
      serialBtn.hidden = false;
      serialBtn.addEventListener("click", () => readCar("serial"));
    }
  });
})();
