/* Compatibility-classification unit tests. Run with: node test/compat.test.js */
const assert = require("node:assert");
const { isFlexFuelRecord, summarizeVariants } = require("../compat.js");

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

console.log("✓ all compatibility tests passed");
