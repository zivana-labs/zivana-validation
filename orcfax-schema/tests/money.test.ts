import assert from "node:assert/strict";
import { fromMinorUnits, minorUnitDecimalsFor, toMinorUnits } from "../src/util/money";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

test("minorUnitDecimalsFor knows the well-known exceptions and defaults to 2", () => {
  assert.equal(minorUnitDecimalsFor("JPY"), 0);
  assert.equal(minorUnitDecimalsFor("BHD"), 3);
  assert.equal(minorUnitDecimalsFor("NGN"), 2);
  assert.equal(minorUnitDecimalsFor("USD"), 2);
  assert.equal(minorUnitDecimalsFor("jpy"), 0); // case-insensitive
});

test("fromMinorUnits formats 2-decimal, 0-decimal, and 3-decimal currencies correctly", () => {
  assert.equal(fromMinorUnits(50000000n, 2), "500000.00");
  assert.equal(fromMinorUnits(500000n, 0), "500000");
  assert.equal(fromMinorUnits(500000n, 3), "500.000");
  assert.equal(fromMinorUnits(0n, 2), "0.00");
  assert.equal(fromMinorUnits(-1999n, 2), "-19.99");
});

test("fromMinorUnits preserves precision above Number.MAX_SAFE_INTEGER, unlike Number(x)/100", () => {
  // 900,719,925,474,099,300 minor units — well past 2^53 (~9.007e15).
  const huge = 9_007_199_254_740_993_00n;

  assert.equal(fromMinorUnits(huge, 2), "9007199254740993.00");

  // The bug this replaces: Number(bigint) rounds before the division even
  // happens, silently changing the value.
  const buggyResult = Number(huge) / 100;
  assert.notEqual(buggyResult, 9007199254740993);
});

test("toMinorUnits and fromMinorUnits round-trip for a whole-number amount", () => {
  assert.equal(fromMinorUnits(toMinorUnits(500000), 2), "500000.00");
});

if (process.exitCode === 1) {
  console.error("\nmoney tests FAILED");
} else {
  console.log("\nall money tests PASSED");
}
