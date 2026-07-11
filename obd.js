/* ═══════════════════════════════════════════════════════════════════════
   READ FROM CAR — OBD-II ethanol & fuel-level readout over Web Bluetooth

   Talks to an ELM327-compatible Bluetooth LE adapter (Veepeak BLE,
   vLinker MC+, OBDLink CX, HM-10 clones…) and reads two standard PIDs:

     0x52  Ethanol fuel %      (A × 100 / 255) — flex-fuel vehicles
     0x2F  Fuel tank level %   (A × 100 / 255)

   Values drop straight into the calculator's "ethanol % in tank" and
   "fuel currently in tank" inputs. Chrome/Edge on Android & desktop only
   (iOS has no Web Bluetooth); the button never renders elsewhere.
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

  if (!("bluetooth" in navigator)) return; // block stays hidden

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

  let device = null;   // remembered across reads this session
  let busy = false;

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function setStatus(msg, cls) {
    const el = $("obd-status");
    el.className = `obd-status ${cls || ""}`;
    el.textContent = msg;
  }

  async function findUart(server) {
    for (const c of UART_CANDIDATES) {
      try {
        const svc = await server.getPrimaryService(c.service);
        const write = await svc.getCharacteristic(c.write);
        const notify = await svc.getCharacteristic(c.notify);
        return { write, notify };
      } catch { /* try the next known layout */ }
    }
    throw new Error("unsupported-adapter");
  }

  /**
   * Send one command and collect notification chunks until the ELM327
   * prompt (">") arrives or the timeout hits.
   */
  function makeChannel(uart) {
    let buffer = "";
    let resolveTurn = null;

    uart.notify.addEventListener("characteristicvaluechanged", (e) => {
      buffer += dec.decode(e.target.value);
      if (buffer.includes(">") && resolveTurn) {
        const out = buffer;
        buffer = "";
        const r = resolveTurn;
        resolveTurn = null;
        r(out);
      }
    });

    return async function send(cmd, timeoutMs = 6000) {
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
      const bytes = enc.encode(`${cmd}\r`);
      if (uart.write.properties.writeWithoutResponse) {
        await uart.write.writeValueWithoutResponse(bytes);
      } else {
        await uart.write.writeValue(bytes);
      }
      return turn;
    };
  }

  async function connect() {
    if (!device || !device.gatt) {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: UART_CANDIDATES.map((c) => c.service),
      });
      device.addEventListener("gattserverdisconnected", () => setStatus("", ""));
    }
    const server = await device.gatt.connect();
    const uart = await findUart(server);
    const send = makeChannel(uart);
    await uart.notify.startNotifications();
    return { send, disconnect: () => device.gatt.disconnect() };
  }

  function applyReading(id, pct) {
    const input = $(id);
    input.value = Math.round(pct);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function readCar() {
    if (busy) return;
    busy = true;
    const btn = $("obd-btn");
    btn.disabled = true;
    let link = null;

    try {
      setStatus("Choose your OBD adapter…", "busy");
      link = await connect();

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
      device = null; // force a fresh chooser next time
      if (err && err.name === "NotFoundError") {
        setStatus("", ""); // user closed the chooser — not an error
      } else if (err && err.message === "unsupported-adapter") {
        setStatus("That device doesn't look like an ELM327 BLE adapter. Classic-Bluetooth dongles won't work — it needs Bluetooth LE (e.g. Veepeak BLE, vLinker MC+).", "warn");
      } else if (err && err.message === "timeout") {
        setStatus("The adapter stopped responding — check it's seated in the OBD port and the ignition is on, then try again.", "warn");
      } else {
        setStatus("Couldn't connect. Make sure the adapter is powered (ignition on) and in range, then try again.", "warn");
      }
    } finally {
      try { if (link) link.disconnect(); } catch { /* already gone */ }
      btn.disabled = false;
      busy = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const block = $("obd-reader");
    block.hidden = false;
    $("obd-btn").addEventListener("click", readCar);
  });
})();
