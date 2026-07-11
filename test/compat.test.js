/* Compatibility-classification unit tests. Run with: node test/compat.test.js */
const assert = require("node:assert");
const { isFlexFuelRecord, summarizeVariants, findTankMatch } = require("../compat.js");

// Real-world shapes from the EPA fueleconomy.gov vehicle records.
assert.ok(isFlexFuelRecord({ atvType: "FFV", fuelType: "Gasoline or E85", fuelType2: "E85" }));
assert.ok(isFlexFuelRecord({ fuelType: "Gasoline or E85" }));
assert.ok(isFlexFuelRecord({ fuelType2: "E85" }));
assert.ok(!isFlexFuelRecord({ fuelType: "Regular", fuelType2: "" }));
assert.ok(!isFlexFuelRecord({ fuelType: "Premium" }));
assert.ok(!isFlexFuelRecord({}));
// Other alt-fuel types don't count as flex-fuel.
assert.ok(!isFlexFuelRecord({ atvType: "Hybrid", fuelType: "Regular Gas and Electricity" }));
assert.ok(!isFlexFuelRecord({ atvType: "Diesel", fuelType: "Diesel" }));

assert.equal(summarizeVariants([{ ffv: true }, { ffv: true }]), "all");
assert.equal(summarizeVariants([{ ffv: true }, { ffv: false }]), "some");
assert.equal(summarizeVariants([{ ffv: false }]), "none");
assert.equal(summarizeVariants([]), "none");

/* ── Tank-size matching against EPA model names ── */
const DATASET = [
  { make: "Ford", model: "F-150", years: [2015, 2023], tank: 23.0, ffv: true },
  { make: "Ford", model: "Mustang (S550/S650)", years: [2015, 2026], tank: 16.0, ffv: false },
  { make: "Volkswagen", model: "Golf GTI (Mk7/Mk8)", years: [2015, 2026], tank: 13.2, ffv: false },
  { make: "Volkswagen", model: "Golf R", years: [2015, 2026], tank: 14.5, ffv: false },
  { make: "Subaru", model: "WRX / STI", years: [2015, 2021], tank: 15.9, ffv: false },
];

// EPA naming quirks resolve to the right curated entry.
assert.equal(findTankMatch(DATASET, 2016, "Ford", "F150 Pickup 2WD FFV").tank, 23.0);
assert.equal(findTankMatch(DATASET, 2020, "Ford", "Mustang").tank, 16.0);
assert.equal(findTankMatch(DATASET, 2018, "Volkswagen", "Golf GTI").tank, 13.2);
assert.equal(findTankMatch(DATASET, 2018, "Volkswagen", "Golf R").tank, 14.5);
assert.equal(findTankMatch(DATASET, 2017, "Subaru", "WRX").tank, 15.9);

// Year outside the range, wrong make, or no overlap → no match.
assert.equal(findTankMatch(DATASET, 2010, "Ford", "F150 Pickup 2WD"), null);
assert.equal(findTankMatch(DATASET, 2016, "Chevrolet", "F150 Pickup 2WD"), null);
assert.equal(findTankMatch(DATASET, 2016, "Ford", "Explorer"), null);
// Too-short overlaps are rejected as ambiguous.
assert.equal(findTankMatch(DATASET, 2016, "Ford", "GT"), null);

console.log("✓ all compatibility tests passed");
