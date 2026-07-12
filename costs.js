/* ═══════════════════════════════════════════════════════════════════════
   WORTH IT? — E85 cost-per-mile & break-even math

   Ethanol carries roughly a third less energy per gallon than gasoline,
   so a blend must be cheaper per gallon to be cheaper per mile. Because
   blending is linear in both price and energy, one number answers it for
   every target blend: the break-even E85 price. Below it, any blend
   saves money per mile; above it, any blend costs more.
   ═══════════════════════════════════════════════════════════════════════ */

/* Pure ethanol's energy deficit vs pure gasoline (BTU/gal, ~76k vs ~114k).
   MPG is assumed proportional to energy content — a tuned engine running
   more timing on ethanol often beats this a little. */
const ETHANOL_ENERGY_PENALTY = 0.33;

/** Energy per gallon of a blend at ethanol fraction e, relative to E0. */
function energyFactor(eth) {
  return 1 - ETHANOL_ENERGY_PENALTY * eth;
}

/** Estimated MPG on a blend, given MPG measured on the usual pump gas. */
function estMpg(baseMpg, blendEth, pumpEth) {
  return baseMpg * (energyFactor(blendEth) / energyFactor(pumpEth));
}

/**
 * Fraction of the mix that must be E85-pump fuel to land a target blend
 * from pump gas. Clamped to [0,1]; null when the two fuels can't steer
 * (E85 pump no richer than pump gas).
 */
function e85Fraction(targetEth, pumpEth, e85Eth) {
  const denom = e85Eth - pumpEth;
  if (denom <= 0) return null;
  return Math.min(1, Math.max(0, (targetEth - pumpEth) / denom));
}

/** $/gal of the blended fill: linear mix of the two pump prices. */
function blendPrice(frac, e85Price, pumpPrice) {
  return frac * e85Price + (1 - frac) * pumpPrice;
}

/** $/mile from $/gal and MPG. */
function costPerMile(pricePerGal, mpg) {
  return mpg > 0 ? pricePerGal / mpg : null;
}

/**
 * The headline: the E85 price at which any blend exactly matches pump
 * gas per mile. Independent of the target blend — falls out of the
 * linearity of both price and energy in the mix.
 */
function breakEvenE85Price(pumpPrice, pumpEth, e85Eth) {
  return pumpPrice * (energyFactor(e85Eth) / energyFactor(pumpEth));
}

/* ── Browser side ─────────────────────────────────────────────────────── */
(function () {
  if (typeof module !== "undefined") {
    module.exports = { energyFactor, estMpg, e85Fraction, blendPrice, costPerMile, breakEvenE85Price };
    return;
  }

  const $ = (id) => document.getElementById(id);
  const els = {};
  const EL_IDS = {
    priceE85: "price-e85",
    pricePump: "price-pump",
    pumpType: "pump-type",
    pumpEth: "pump-eth",
    e85Eth: "e85-eth",
    e85EthOut: "e85-eth-out",
    target: "target-eth",
    targetOut: "target-eth-out",
    baseMpg: "base-mpg",
    bePrice: "be-price",
    beNote: "be-note",
    verdict: "verdict-msg",
    rows: "cost-rows",
    delta1k: "delta-1k",
  };

  const STORE_KEY = "e85calc:costs:v1";
  const PERSIST = ["priceE85", "pricePump", "pumpType", "pumpEth", "e85Eth", "target", "baseMpg"];

  const clampPct = (v) => Math.min(100, Math.max(0, parseFloat(v) || 0));
  const money = (v) => `$${v.toFixed(2)}`;

  function syncSliderFill(el) {
    const min = +el.min || 0;
    const max = +el.max || 100;
    const pct = max > min ? ((+el.value - min) / (max - min)) * 100 : 0;
    el.style.setProperty("--fill", `${pct}%`);
  }

  function applyPumpType() {
    const map = { e0: 0, e10: 10, e15: 15 };
    if (els.pumpType.value in map) els.pumpEth.value = map[els.pumpType.value];
    els.pumpEth.disabled = els.pumpType.value !== "custom";
  }

  function saveState() {
    try {
      const state = {};
      PERSIST.forEach((k) => (state[k] = els[k].value));
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch { /* storage unavailable — fine */ }
  }

  function restoreState() {
    try {
      // Seed fuel facts from the blend calculator's saved setup, then let
      // this page's own saved state win.
      const calc = JSON.parse(localStorage.getItem("e85calc:v1"));
      if (calc) {
        if (calc.e85Eth != null) els.e85Eth.value = calc.e85Eth;
        if (calc.pumpType != null) els.pumpType.value = calc.pumpType;
        if (calc.pumpEth != null) els.pumpEth.value = calc.pumpEth;
        if (calc.target != null) els.target.value = calc.target;
      }
      const own = JSON.parse(localStorage.getItem(STORE_KEY));
      if (own) PERSIST.forEach((k) => { if (own[k] != null) els[k].value = own[k]; });
    } catch { /* defaults are fine */ }
  }

  function row(name, cls, price, mpg, cpm, maxCpm) {
    const width = maxCpm > 0 ? (cpm / maxCpm) * 100 : 0;
    return `
      <div class="cost-row">
        <span class="cost-name">${name}</span>
        <div class="cost-bar"><div class="cost-fill ${cls}" style="width:${width}%"></div></div>
        <span class="cost-figs">${money(price)}/gal · ${mpg.toFixed(1)} mpg · <strong>${(cpm * 100).toFixed(1)}¢/mi</strong></span>
      </div>`;
  }

  function recalc() {
    const priceE85 = Math.max(0, parseFloat(els.priceE85.value) || 0);
    const pricePump = Math.max(0, parseFloat(els.pricePump.value) || 0);
    const pumpEth = clampPct(els.pumpEth.value) / 100;
    const e85Eth = (+els.e85Eth.value) / 100;
    const targetEth = (+els.target.value) / 100;
    const baseMpg = Math.max(0, parseFloat(els.baseMpg.value) || 0);

    els.e85EthOut.textContent = `E${els.e85Eth.value}`;
    els.targetOut.textContent = `E${els.target.value}`;
    [els.e85Eth, els.target].forEach(syncSliderFill);
    saveState();

    const frac = e85Fraction(targetEth, pumpEth, e85Eth);
    if (frac == null || pricePump <= 0 || priceE85 <= 0 || baseMpg <= 0) {
      els.bePrice.textContent = "—";
      els.beNote.textContent = "";
      els.rows.innerHTML = "";
      els.delta1k.textContent = "";
      els.verdict.className = "status warn";
      els.verdict.textContent = frac == null
        ? "Pump-gas ethanol is at or above the E85 pump's — check those two inputs."
        : "Enter both prices and your MPG to run the numbers.";
      return;
    }

    const be = breakEvenE85Price(pricePump, pumpEth, e85Eth);
    els.bePrice.textContent = money(be);
    els.beNote.textContent = `with pump gas at ${money(pricePump)} — and it's the same threshold for every target blend`;

    const mpgBlend = estMpg(baseMpg, targetEth, pumpEth);
    const mpgE85 = estMpg(baseMpg, e85Eth, pumpEth);
    const priceBlend = blendPrice(frac, priceE85, pricePump);

    const cpmPump = costPerMile(pricePump, baseMpg);
    const cpmBlend = costPerMile(priceBlend, mpgBlend);
    const cpmE85 = costPerMile(priceE85, mpgE85);
    const maxCpm = Math.max(cpmPump, cpmBlend, cpmE85);

    els.rows.innerHTML =
      row(`PUMP GAS E${Math.round(pumpEth * 100)}`, "fill-pump", pricePump, baseMpg, cpmPump, maxCpm) +
      row(`TARGET E${els.target.value}`, "fill-blend", priceBlend, mpgBlend, cpmBlend, maxCpm) +
      row(`STRAIGHT E${els.e85Eth.value}`, "fill-e85", priceE85, mpgE85, cpmE85, maxCpm);

    const delta = (cpmBlend - cpmPump) * 1000;
    els.delta1k.textContent = delta <= 0
      ? `Running E${els.target.value} saves about ${money(Math.abs(delta))} per 1,000 miles vs pump gas.`
      : `Running E${els.target.value} costs about ${money(delta)} more per 1,000 miles vs pump gas.`;

    const saves = priceE85 < be;
    els.verdict.className = `status ${saves ? "ok" : "warn"}`;
    els.verdict.textContent = saves
      ? `At ${money(priceE85)}, E85 is under the break-even price — every blend is cheaper per mile than pump gas. Fill away.`
      : `At ${money(priceE85)}, E85 is over the break-even price — blends cost more per mile. You're paying for octane, not economy.`;
  }

  function init() {
    for (const [key, id] of Object.entries(EL_IDS)) els[key] = $(id);

    restoreState();
    applyPumpType();

    els.pumpType.addEventListener("change", () => { applyPumpType(); recalc(); });
    ["input", "change"].forEach((evt) => {
      [els.priceE85, els.pricePump, els.pumpEth, els.e85Eth, els.target, els.baseMpg]
        .forEach((el) => el.addEventListener(evt, recalc));
    });

    recalc();

    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
