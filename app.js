/* ═══════════════════════════════════════════════════════════════════════
   E85 BLEND LAB — calculator logic + UI wiring
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Core blend math.
 *
 * You have `currentGal` gallons at `currentEth` ethanol fraction already in
 * the tank. You add `add` gallons split between `x` of E85-pump fuel (at
 * `e85Eth`) and `y` of regular pump gas (at `pumpEth`) so the fuel in the
 * tank afterward lands on `targetEth`:
 *
 *   x + y = add
 *   (currentGal·currentEth + x·e85Eth + y·pumpEth) / (currentGal + add) = targetEth
 *
 * Solving for x (with total = currentGal + add):
 *   x = (total·targetEth − currentGal·currentEth − add·pumpEth) / (e85Eth − pumpEth)
 *
 * `addGal` is optional — omitted means fill the tank (add = remaining space).
 * All ethanol values are fractions (0–1). Result is clamped to what is
 * physically possible and reports the achieved blend.
 */
function calcBlend({ tank, currentGal, currentEth, pumpEth, e85Eth, targetEth, addGal }) {
  const space = Math.max(0, tank - currentGal);
  const add = addGal == null ? space : Math.min(Math.max(0, addGal), space);
  const total = currentGal + add;
  const denom = e85Eth - pumpEth;

  let x = denom > 0
    ? (total * targetEth - currentGal * currentEth - add * pumpEth) / denom
    : 0;

  let status = "ok"; // ok | target_below | target_above | tank_full | no_add
  if (space === 0) {
    x = 0;
    status = "tank_full";
  } else if (add === 0) {
    x = 0;
    status = "no_add";
  } else if (x < 0) {
    x = 0; // even pure pump gas leaves the blend above target
    status = "target_below";
  } else if (x > add) {
    x = add; // even adding pure E85 can't reach target
    status = "target_above";
  }

  const y = add - x;
  const finalEth = total > 0
    ? (currentGal * currentEth + x * e85Eth + y * pumpEth) / total
    : 0;

  return { e85Gal: x, gasGal: y, finalEth, status, totalGal: total };
}

/* ── DOM helpers ───────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const EL_IDS = {
  year: "veh-year",
  make: "veh-make",
  model: "veh-model",
  vehNote: "veh-note",
  tank: "tank-size",
  level: "fuel-level",
  levelOut: "fuel-level-out",
  currentEth: "current-eth",
  fillMode: "fill-mode",
  addGal: "add-gal",
  pumpType: "pump-type",
  pumpEth: "pump-eth",
  e85Eth: "e85-eth",
  e85EthOut: "e85-eth-out",
  target: "target-eth",
  targetOut: "target-eth-out",
  addE85: "add-e85",
  addGas: "add-gas",
  finalBlend: "final-blend",
  finalTotal: "final-total",
  statusMsg: "status-msg",
  needle: "gauge-needle",
  gaugeArc: "gauge-arc",
  gaugeValue: "gauge-value",
  mixE85: "mix-e85",
  mixGas: "mix-gas",
  mixExisting: "mix-existing",
};

const els = {}; // bound to DOM nodes in init()

/* ── Vehicle picker ────────────────────────────────────────────────────── */
function populateYears() {
  const years = new Set();
  VEHICLES.forEach((v) => {
    for (let y = v.years[0]; y <= v.years[1]; y++) years.add(y);
  });
  [...years].sort((a, b) => b - a).forEach((y) => {
    els.year.add(new Option(y, y));
  });
}

function vehiclesForYear(year) {
  return VEHICLES.filter((v) => year >= v.years[0] && year <= v.years[1]);
}

function refreshMakes() {
  const year = +els.year.value;
  els.make.length = 1;
  els.model.length = 1;
  els.make.disabled = els.model.disabled = !year;
  setVehicleNote(null);
  if (!year) return;
  [...new Set(vehiclesForYear(year).map((v) => v.make))]
    .sort()
    .forEach((m) => els.make.add(new Option(m, m)));
}

function refreshModels() {
  const year = +els.year.value;
  const make = els.make.value;
  els.model.length = 1;
  els.model.disabled = !make;
  setVehicleNote(null);
  if (!make) return;
  vehiclesForYear(year)
    .filter((v) => v.make === make)
    .sort((a, b) => a.model.localeCompare(b.model))
    .forEach((v) => els.model.add(new Option(v.model, v.model)));
}

function applyVehicle() {
  const year = +els.year.value;
  const v = vehiclesForYear(year).find(
    (x) => x.make === els.make.value && x.model === els.model.value
  );
  if (!v) return setVehicleNote(null);
  els.tank.value = v.tank;
  setVehicleNote(v);
  recalc();
}

function setVehicleNote(v) {
  if (!v) {
    els.vehNote.innerHTML = "";
    return;
  }
  const badge = v.ffv
    ? `<span class="badge badge-ffv">⚡ FACTORY FLEX-FUEL</span>
       <span class="badge-sub">Offered as E85-capable on select engines/trims — verify yours.</span>`
    : `<span class="badge badge-mod">🔧 MODS LIKELY REQUIRED</span>
       <span class="badge-sub">Not a factory flex-fuel platform — high ethanol blends typically need tuning &amp; fuel-system upgrades.</span>`;
  els.vehNote.innerHTML =
    `<span class="badge-tank">TANK ≈ ${v.tank.toFixed(1)} GAL</span>${badge}
     <span class="badge-sub">Capacity is approximate — confirm in your owner's manual.</span>`;
}

/* ── Gauge (240° sweep, 0–100% ethanol) ───────────────────────────────── */
const GAUGE_SWEEP = 240;           // degrees of arc
const GAUGE_START = -210;          // needle angle at 0%  (pointing lower-left)
const ARC_LEN = 314;               // path length set via stroke-dasharray

function setGauge(frac) {
  const clamped = Math.min(1, Math.max(0, frac));
  const angle = GAUGE_START + clamped * GAUGE_SWEEP;
  els.needle.style.transform = `rotate(${angle + 90}deg)`;
  els.gaugeArc.style.strokeDashoffset = ARC_LEN * (1 - clamped);
  els.gaugeValue.textContent = `E${Math.round(clamped * 100)}`;
}

/* ── Recalculate & render ─────────────────────────────────────────────── */
const STATUS_TEXT = {
  ok: { cls: "ok", msg: "Dialed in. Pump the amounts below and roll out. ✨" },
  tank_full: { cls: "warn", msg: "Tank is already full — burn some fuel before blending." },
  no_add: { cls: "warn", msg: "Adding zero gallons — the blend stays at what's already in the tank." },
  target_below: {
    cls: "warn",
    msg: "The fuel already in your tank is richer than the target — even topping off with pure pump gas lands above it. Shown is the leanest blend you can reach without draining.",
  },
  target_above: {
    cls: "warn",
    msg: "Target is out of reach — even filling every remaining gallon with E85 falls short. Shown is the richest blend you can reach right now.",
  },
};

function fmtGal(g) {
  return `${g.toFixed(2)}<span class="unit"> gal</span>`;
}

function recalc() {
  const tank = Math.max(0, parseFloat(els.tank.value) || 0);
  const levelPct = +els.level.value;
  const currentGal = (tank * levelPct) / 100;
  const space = Math.max(0, tank - currentGal);

  const partial = els.fillMode.value === "partial";
  els.addGal.disabled = !partial;
  els.addGal.max = space.toFixed(1);
  let addGal;
  if (partial) {
    addGal = Math.min(Math.max(0, parseFloat(els.addGal.value) || 0), space);
  } else {
    addGal = space;
    els.addGal.value = space.toFixed(1);
  }

  const inputs = {
    tank,
    currentGal,
    currentEth: (parseFloat(els.currentEth.value) || 0) / 100,
    pumpEth: (parseFloat(els.pumpEth.value) || 0) / 100,
    e85Eth: (+els.e85Eth.value) / 100,
    targetEth: (+els.target.value) / 100,
    addGal,
  };

  // Live slider readouts
  els.levelOut.textContent = `${levelPct}% (${currentGal.toFixed(1)} gal)`;
  els.e85EthOut.textContent = `E${els.e85Eth.value}`;
  els.targetOut.textContent = `E${els.target.value}`;

  if (tank <= 0) {
    els.addE85.innerHTML = fmtGal(0);
    els.addGas.innerHTML = fmtGal(0);
    els.finalBlend.textContent = "E0";
    els.finalTotal.textContent = "0.0 gal";
    els.statusMsg.className = "status warn";
    els.statusMsg.textContent = "Enter your tank size to run the numbers.";
    setGauge(0);
    setMixBar(0, 0, 0, 1);
    return;
  }

  const r = calcBlend(inputs);

  els.addE85.innerHTML = fmtGal(r.e85Gal);
  els.addGas.innerHTML = fmtGal(r.gasGal);
  els.finalBlend.textContent = `E${Math.round(r.finalEth * 100)}`;
  els.finalTotal.textContent = `${r.totalGal.toFixed(1)} gal`;

  const st = STATUS_TEXT[r.status];
  els.statusMsg.className = `status ${st.cls}`;
  els.statusMsg.textContent = st.msg;

  setGauge(r.finalEth);
  setMixBar(r.e85Gal / tank, r.gasGal / tank, currentGal / tank, 0);
}

function setMixBar(e85, gas, existing, empty) {
  els.mixE85.style.width = `${e85 * 100}%`;
  els.mixGas.style.width = `${gas * 100}%`;
  els.mixExisting.style.width = `${existing * 100}%`;
}

/* ── Wiring ───────────────────────────────────────────────────────────── */
function init() {
  for (const [key, id] of Object.entries(EL_IDS)) els[key] = $(id);

  populateYears();

  els.year.addEventListener("change", () => { refreshMakes(); });
  els.make.addEventListener("change", () => { refreshModels(); });
  els.model.addEventListener("change", applyVehicle);

  // Pump-gas preset → ethanol %
  els.pumpType.addEventListener("change", () => {
    const map = { e0: 0, e10: 10, e15: 15 };
    if (els.pumpType.value in map) els.pumpEth.value = map[els.pumpType.value];
    els.pumpEth.disabled = els.pumpType.value !== "custom";
    recalc();
  });

  ["input", "change"].forEach((evt) => {
    [els.tank, els.level, els.currentEth, els.fillMode, els.addGal, els.pumpEth, els.e85Eth, els.target]
      .forEach((el) => el.addEventListener(evt, recalc));
  });

  recalc();
}

// Export for tests (Node) without breaking the browser.
if (typeof module !== "undefined") {
  module.exports = { calcBlend };
} else {
  document.addEventListener("DOMContentLoaded", init);
}
