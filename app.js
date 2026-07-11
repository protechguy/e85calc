/* ═══════════════════════════════════════════════════════════════════════
   E85 BLEND LAB — calculator logic + UI wiring
   ═══════════════════════════════════════════════════════════════════════ */

/* Inline SVG icons (shared with compat.js via classic-script global scope).
   Stroke icons inherit currentColor so they tint with their badge. */
const ICONS = {
  bolt: `<svg class="ico ico-solid" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z"/></svg>`,
  wrench: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.7L3 17.7A2.1 2.1 0 0 0 6 20.7l5.7-5.7a4.5 4.5 0 0 0 5.7-6L14 12.4 11.6 10l3.1-3.7z"/></svg>`,
};

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

  let status = "ok"; // ok | target_below | target_above | tank_full | no_add | bad_mix
  if (space === 0) {
    x = 0;
    status = "tank_full";
  } else if (add === 0) {
    x = 0;
    status = "no_add";
  } else if (denom <= 0) {
    x = 0; // "E85" is no richer than the pump gas — no blend can be steered
    status = "bad_mix";
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

/**
 * Tube-tester math.
 *
 * A graduated tester is filled with water to `waterMl`, topped up with fuel
 * to `totalMl`, and shaken. Ethanol bonds to the water, so the separation
 * line rises to `sepMl`. The ethanol absorbed is (sepMl − waterMl) out of
 * (totalMl − waterMl) of fuel.
 *
 * Returns the ethanol percentage (0–100), or null when the readings can't
 * form a valid test. Ignores the small water/ethanol volume-contraction
 * effect, like the printed scales on most testers.
 */
function calcTubeTest({ waterMl, totalMl, sepMl }) {
  const fuel = totalMl - waterMl;
  if (!(waterMl >= 0) || !(fuel > 0) || !(sepMl >= 0)) return null;
  const absorbed = Math.min(Math.max(sepMl - waterMl, 0), fuel);
  return (absorbed / fuel) * 100;
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
  testWater: "test-water",
  testTotal: "test-total",
  testSep: "test-sep",
  testResult: "test-result",
  testUseE85: "test-use-e85",
  testUseTank: "test-use-tank",
  quickbar: "quickbar",
  qbBlend: "qb-blend",
  qbE85: "qb-e85",
  qbGas: "qb-gas",
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
    ? `<span class="badge badge-ffv">${ICONS.bolt} FACTORY FLEX-FUEL</span>
       <span class="badge-sub">Offered as E85-capable on select engines/trims — verify yours.</span>`
    : `<span class="badge badge-mod">${ICONS.wrench} MODS LIKELY REQUIRED</span>
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
  ok: { cls: "ok", msg: "Dialed in. Pump the amounts above and roll out." },
  tank_full: { cls: "warn", msg: "Tank is already full — burn some fuel before blending." },
  no_add: { cls: "warn", msg: "Adding zero gallons — the blend stays at what's already in the tank." },
  bad_mix: {
    cls: "warn",
    msg: "Pump-gas ethanol is at or above the E85 pump's — the two fuels can't steer the blend. Check those inputs (they may be swapped).",
  },
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

const clampPct = (v) => Math.min(100, Math.max(0, parseFloat(v) || 0));

/* Paint the filled portion of a slider track (see --fill in styles.css). */
function syncSliderFill(el) {
  const min = +el.min || 0;
  const max = +el.max || 100;
  const pct = max > min ? ((+el.value - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--fill", `${pct}%`);
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
    currentEth: clampPct(els.currentEth.value) / 100,
    pumpEth: clampPct(els.pumpEth.value) / 100,
    e85Eth: (+els.e85Eth.value) / 100,
    targetEth: (+els.target.value) / 100,
    addGal,
  };

  // Live slider readouts & track fills
  els.levelOut.textContent = `${levelPct}% (${currentGal.toFixed(1)} gal)`;
  els.e85EthOut.textContent = `E${els.e85Eth.value}`;
  els.targetOut.textContent = `E${els.target.value}`;
  [els.level, els.e85Eth, els.target].forEach(syncSliderFill);

  if (tank <= 0) {
    els.addE85.innerHTML = fmtGal(0);
    els.addGas.innerHTML = fmtGal(0);
    els.finalBlend.textContent = "E0";
    els.finalTotal.textContent = "0.0 gal";
    els.statusMsg.className = "status warn";
    els.statusMsg.textContent = "Enter your tank size to run the numbers.";
    setGauge(0);
    setMixBar(0, 0, 0, 1);
    setQuickbar(null);
    saveState();
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
  setQuickbar(r);
  saveState();
}

function setMixBar(e85, gas, existing, empty) {
  els.mixE85.style.width = `${e85 * 100}%`;
  els.mixGas.style.width = `${gas * 100}%`;
  els.mixExisting.style.width = `${existing * 100}%`;
}

/* ── Mobile quick-bar (mirrors the result while it's scrolled off) ────── */
let quickbarHasResult = false;
let resultsInView = true;

function setQuickbar(r) {
  quickbarHasResult = !!r;
  if (r) {
    els.qbBlend.textContent = `E${Math.round(r.finalEth * 100)}`;
    els.qbE85.textContent = r.e85Gal.toFixed(1);
    els.qbGas.textContent = r.gasGal.toFixed(1);
  }
  updateQuickbarVisibility();
}

function updateQuickbarVisibility() {
  els.quickbar.classList.toggle("is-visible", quickbarHasResult && !resultsInView);
}

function initQuickbar() {
  if (typeof IntersectionObserver === "undefined") return;
  document.body.classList.add("has-quickbar");

  const results = document.querySelector(".panel-results");
  new IntersectionObserver(
    ([entry]) => {
      resultsInView = entry.isIntersecting;
      updateQuickbarVisibility();
    },
    { threshold: 0.25 }
  ).observe(results);

  els.quickbar.addEventListener("click", () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    results.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });
}

/* ── Remember settings between fill-ups ───────────────────────────────── */
const STORE_KEY = "e85calc:v1";
const PERSIST_KEYS = ["tank", "level", "currentEth", "fillMode", "addGal", "pumpType", "pumpEth", "e85Eth", "target"];

function saveState() {
  try {
    const state = {};
    PERSIST_KEYS.forEach((k) => (state[k] = els[k].value));
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch { /* private mode / storage denied — live without memory */ }
}

function restoreState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!state) return;
    PERSIST_KEYS.forEach((k) => {
      if (state[k] != null) els[k].value = state[k];
    });
  } catch { /* corrupt or unavailable — defaults are fine */ }
}

/* ── Tube-tester helper ───────────────────────────────────────────────── */
function recalcTest() {
  const pct = calcTubeTest({
    waterMl: parseFloat(els.testWater.value),
    totalMl: parseFloat(els.testTotal.value),
    sepMl: parseFloat(els.testSep.value),
  });
  const valid = pct != null;
  els.testResult.textContent = valid ? `E${Math.round(pct)}` : "—";
  els.testUseE85.disabled = !valid;
  els.testUseTank.disabled = !valid;
  return pct;
}

function initTester() {
  [els.testWater, els.testTotal, els.testSep].forEach((el) =>
    el.addEventListener("input", recalcTest)
  );

  els.testUseE85.addEventListener("click", () => {
    const pct = recalcTest();
    if (pct == null) return;
    // Clamp to the slider's range (E51–E98).
    els.e85Eth.value = Math.min(Math.max(Math.round(pct), +els.e85Eth.min), +els.e85Eth.max);
    recalc();
  });

  els.testUseTank.addEventListener("click", () => {
    const pct = recalcTest();
    if (pct == null) return;
    els.currentEth.value = Math.round(pct);
    recalc();
  });

  recalcTest();
}

/* ── Wiring ───────────────────────────────────────────────────────────── */
function applyPumpType() {
  const map = { e0: 0, e10: 10, e15: 15 };
  if (els.pumpType.value in map) els.pumpEth.value = map[els.pumpType.value];
  els.pumpEth.disabled = els.pumpType.value !== "custom";
}

function init() {
  for (const [key, id] of Object.entries(EL_IDS)) els[key] = $(id);

  populateYears();
  restoreState();
  applyPumpType();

  els.year.addEventListener("change", () => { refreshMakes(); });
  els.make.addEventListener("change", () => { refreshModels(); });
  els.model.addEventListener("change", applyVehicle);

  // Pump-gas preset → ethanol %
  els.pumpType.addEventListener("change", () => {
    applyPumpType();
    recalc();
  });

  ["input", "change"].forEach((evt) => {
    [els.tank, els.level, els.currentEth, els.fillMode, els.addGal, els.pumpEth, els.e85Eth, els.target]
      .forEach((el) => el.addEventListener(evt, recalc));
  });

  initTester();
  initQuickbar();
  recalc();

  // Offline support (no-op where service workers are unavailable).
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// Export for tests (Node) without breaking the browser.
if (typeof module !== "undefined") {
  module.exports = { calcBlend, calcTubeTest };
} else {
  document.addEventListener("DOMContentLoaded", init);
}
