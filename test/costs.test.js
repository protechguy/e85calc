/* Cost-per-mile & break-even unit tests. Run with: node test/costs.test.js */
const assert = require("node:assert");
const { energyFactor, estMpg, e85Fraction, blendPrice, costPerMile, breakEvenE85Price } = require("../costs.js");

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/* ── energyFactor: linear penalty, anchored at E0 and E100 ── */
close(energyFactor(0), 1);
close(energyFactor(1), 0.67);
close(energyFactor(0.85), 1 - 0.33 * 0.85);

/* ── estMpg: proportional to energy, relative to the user's pump gas ── */
// Same blend as baseline → same MPG.
close(estMpg(20, 0.10, 0.10), 20);
// E30 from an E10 baseline: 20 × (0.901 / 0.967).
close(estMpg(20, 0.30, 0.10), 20 * (0.901 / 0.967));
// Richer blend always costs MPG.
assert.ok(estMpg(20, 0.85, 0.10) < estMpg(20, 0.30, 0.10));

/* ── e85Fraction ── */
// Classic: E30 target from E10 pump + E85 pump → 20/75.
close(e85Fraction(0.30, 0.10, 0.85), 0.20 / 0.75);
// Target at or below pump gas → all pump gas.
close(e85Fraction(0.10, 0.10, 0.85), 0);
close(e85Fraction(0.05, 0.10, 0.85), 0);
// Target at or beyond the E85 pump → all E85.
close(e85Fraction(0.85, 0.10, 0.85), 1);
close(e85Fraction(0.95, 0.10, 0.85), 1);
// Degenerate fuels → null.
assert.equal(e85Fraction(0.30, 0.10, 0.10), null);
assert.equal(e85Fraction(0.30, 0.85, 0.70), null);

/* ── blendPrice ── */
close(blendPrice(0, 2.79, 3.49), 3.49);
close(blendPrice(1, 2.79, 3.49), 2.79);
close(blendPrice(0.5, 2.00, 4.00), 3.00);

/* ── costPerMile ── */
close(costPerMile(3.49, 20), 0.1745);
assert.equal(costPerMile(3.49, 0), null);

/* ── breakEvenE85Price: the headline ── */
// E85 (actual E85) vs E10 pump at $3.50 → 3.50 × 0.7195/0.967.
close(breakEvenE85Price(3.50, 0.10, 0.85), 3.50 * (0.7195 / 0.967));

// The whole reason one number works: at the break-even price, cost per
// mile of ANY target blend equals pump gas cost per mile.
{
  const pumpPrice = 3.50, pumpEth = 0.10, e85Eth = 0.78, baseMpg = 22;
  const be = breakEvenE85Price(pumpPrice, pumpEth, e85Eth);
  const cpmPump = costPerMile(pumpPrice, baseMpg);
  for (const target of [0.20, 0.30, 0.50, 0.78]) {
    const f = e85Fraction(target, pumpEth, e85Eth);
    const cpm = costPerMile(blendPrice(f, be, pumpPrice), estMpg(baseMpg, target, pumpEth));
    close(cpm, cpmPump, 1e-9);
  }
}

// Below break-even, blends are cheaper per mile; above, dearer.
{
  const pumpPrice = 3.50, pumpEth = 0.10, e85Eth = 0.85, baseMpg = 20;
  const be = breakEvenE85Price(pumpPrice, pumpEth, e85Eth);
  const f = e85Fraction(0.30, pumpEth, e85Eth);
  const mpg = estMpg(baseMpg, 0.30, pumpEth);
  const cpmPump = costPerMile(pumpPrice, baseMpg);
  assert.ok(costPerMile(blendPrice(f, be - 0.25, pumpPrice), mpg) < cpmPump);
  assert.ok(costPerMile(blendPrice(f, be + 0.25, pumpPrice), mpg) > cpmPump);
}

console.log("✓ all cost-math tests passed");
