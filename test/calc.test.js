/* Blend-math unit tests. Run with: node test/calc.test.js */
const assert = require("node:assert");
const { calcBlend } = require("../app.js");

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

// Empty 16-gal tank, E10 pump gas + E85, target E30 → classic case.
{
  const r = calcBlend({ tank: 16, currentGal: 0, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.30 });
  assert.equal(r.status, "ok");
  close(r.e85Gal + r.gasGal, 16);
  close(r.finalEth, 0.30);
  // x = (16*0.30 - 0 - 16*0.10) / 0.75 = 3.2/0.75
  close(r.e85Gal, 3.2 / 0.75);
}

// Quarter tank of E10 already in a 16-gal tank, target E50.
{
  const r = calcBlend({ tank: 16, currentGal: 4, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.50 });
  assert.equal(r.status, "ok");
  close(r.e85Gal + r.gasGal, 12);
  close(r.finalEth, 0.50);
}

// Target below what's achievable: half tank of E85 already in, target E10.
{
  const r = calcBlend({ tank: 16, currentGal: 8, currentEth: 0.85, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.10 });
  assert.equal(r.status, "target_below");
  close(r.e85Gal, 0);
  close(r.gasGal, 8);
  close(r.finalEth, (8 * 0.85 + 8 * 0.10) / 16); // best achievable ≈ E47.5
}

// Target above what's achievable: nearly full tank of E10, target E85.
{
  const r = calcBlend({ tank: 16, currentGal: 15, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.85 });
  assert.equal(r.status, "target_above");
  close(r.e85Gal, 1);
  close(r.gasGal, 0);
}

// Tank already full → nothing to add.
{
  const r = calcBlend({ tank: 16, currentGal: 16, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.30 });
  assert.equal(r.status, "tank_full");
  close(r.e85Gal, 0);
  close(r.gasGal, 0);
  close(r.finalEth, 0.10);
}

// Winter-blend E85 (E70) needs more gallons than summer E85 for same target.
{
  const summer = calcBlend({ tank: 16, currentGal: 0, currentEth: 0, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.30 });
  const winter = calcBlend({ tank: 16, currentGal: 0, currentEth: 0, pumpEth: 0.10, e85Eth: 0.70, targetEth: 0.30 });
  assert.ok(winter.e85Gal > summer.e85Gal);
  close(winter.finalEth, 0.30);
}

// Degenerate: pump and "E85" ethanol identical → no solution, clamps sanely.
{
  const r = calcBlend({ tank: 16, currentGal: 0, currentEth: 0, pumpEth: 0.10, e85Eth: 0.10, targetEth: 0.30 });
  assert.ok(r.e85Gal >= 0 && r.gasGal >= 0);
  close(r.e85Gal + r.gasGal, 16);
}

/* ── Partial fill ── */

// Quarter tank of E10, add only 6 gallons, target E30 for the resulting mix.
{
  const r = calcBlend({ tank: 16, currentGal: 4, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.30, addGal: 6 });
  assert.equal(r.status, "ok");
  close(r.e85Gal + r.gasGal, 6);
  close(r.totalGal, 10);
  close(r.finalEth, 0.30);
  // x = (10·0.30 − 4·0.10 − 6·0.10) / 0.75 = 2/0.75
  close(r.e85Gal, 2 / 0.75);
}

// Partial amount too small to reach the target → clamps to all-E85.
{
  const r = calcBlend({ tank: 16, currentGal: 8, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.70, addGal: 2 });
  assert.equal(r.status, "target_above");
  close(r.e85Gal, 2);
  close(r.gasGal, 0);
  close(r.finalEth, (8 * 0.10 + 2 * 0.85) / 10);
}

// Requested amount larger than remaining space → clamps to the space.
{
  const r = calcBlend({ tank: 16, currentGal: 12, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.30, addGal: 50 });
  close(r.e85Gal + r.gasGal, 4);
  close(r.totalGal, 16);
}

// Adding zero gallons → blend unchanged, flagged.
{
  const r = calcBlend({ tank: 16, currentGal: 8, currentEth: 0.30, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.50, addGal: 0 });
  assert.equal(r.status, "no_add");
  close(r.e85Gal, 0);
  close(r.gasGal, 0);
  close(r.finalEth, 0.30);
}

// Omitted addGal still means "fill the tank" (backwards compatible).
{
  const full = calcBlend({ tank: 16, currentGal: 4, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.50 });
  const explicit = calcBlend({ tank: 16, currentGal: 4, currentEth: 0.10, pumpEth: 0.10, e85Eth: 0.85, targetEth: 0.50, addGal: 12 });
  close(full.e85Gal, explicit.e85Gal);
  close(full.totalGal, 16);
}

console.log("✓ all blend-math tests passed");
