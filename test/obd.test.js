/* OBD-II response-parsing unit tests. Run with: node test/obd.test.js */
const assert = require("node:assert");
const { extractPidByte, decodePct } = require("../obd.js");

const close = (a, b, eps = 0.05) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/* ── extractPidByte: the happy path ── */

// Clean spaced response: 0xA3 = 163.
assert.equal(extractPidByte("41 52 A3 \r\r>", "52"), 0xa3);

// Spaces off (ATS0-style).
assert.equal(extractPidByte("4152A3\r>", "52"), 0xa3);

// Lowercase pid argument and lowercase adapter output both work.
assert.equal(extractPidByte("41 52 a3\r>", "52"), 0xa3);
assert.equal(extractPidByte("41 2F 6B\r>", "2f"), 0x6b);

/* ── Adapter noise ── */

// Echo on: request line precedes the response and must not match.
assert.equal(extractPidByte("0152\r41 52 80\r\r>", "52"), 0x80);

// SEARCHING... preamble on first query after ATSP0.
assert.equal(extractPidByte("SEARCHING...\r41 52 FF\r\r>", "52"), 0xff);

// CAN headers on (ATH1): 7E8 = ECU address, 03 = byte count.
assert.equal(extractPidByte("7E8 03 41 52 A3\r\r>", "52"), 0xa3);

// Multi-ECU reply: first positive response wins.
assert.equal(extractPidByte("7E8 03 41 2F 40\r7E9 03 41 2F 42\r\r>", "2F"), 0x40);

// Zero is a legitimate reading (E0 in the tank), not a miss.
assert.equal(extractPidByte("41 52 00\r>", "52"), 0);

/* ── Failures return null ── */

assert.equal(extractPidByte("NO DATA\r\r>", "52"), null);
assert.equal(extractPidByte("CAN ERROR\r>", "52"), null);
assert.equal(extractPidByte("UNABLE TO CONNECT\r>", "52"), null);
assert.equal(extractPidByte("STOPPED\r>", "52"), null);
assert.equal(extractPidByte("?\r>", "52"), null);
assert.equal(extractPidByte("", "52"), null);
assert.equal(extractPidByte(null, "52"), null);

// Negative response (7F 01 12 = service not supported) must not match.
assert.equal(extractPidByte("7F 01 12\r\r>", "52"), null);

// A response for a *different* PID must not satisfy this one.
assert.equal(extractPidByte("41 2F 6B\r\r>", "52"), null);

// Truncated response (pattern present but data byte missing).
assert.equal(extractPidByte("41 52\r>", "52"), null);

/* ── decodePct: A × 100 / 255 ── */

close(decodePct(0x00), 0);
close(decodePct(0xff), 100);
close(decodePct(0xa3), 63.9); // ≈ E64
close(decodePct(0x80), 50.2);
assert.equal(decodePct(null), null);

console.log("✓ all OBD parsing tests passed");
