/** Converts a decimal currency amount to an exact integer count of minor
 * units (e.g. cents/kobo) without floating-point multiplication.
 *
 * `value * 100` misrounds for inputs whose double representation isn't
 * exact (e.g. `1.005 * 100 === 100.49999999999999`, which rounds down to
 * 100 instead of 101). This instead reads back `value`'s shortest
 * round-tripping decimal string (what `Number.prototype.toString()`
 * guarantees) and shifts the decimal point by string manipulation, so no
 * new rounding error is introduced beyond whatever the JSON number
 * literal already carried.
 *
 * Throws rather than silently truncating/rounding if `value` carries more
 * precision than `decimals` allows, or isn't a plain finite decimal — a
 * revenue amount should never need that, and silent rounding is the wrong
 * default for money.
 */
export function toMinorUnits(value: number, decimals = 2): bigint {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert non-finite value ${value} to minor units`);
  }

  const negative = value < 0;
  const literal = String(Math.abs(value));

  if (/[eE]/.test(literal)) {
    throw new Error(
      `Value ${value} serializes to exponential notation (${literal}); ` +
        "expected a plain decimal amount"
    );
  }

  const [whole, fraction = ""] = literal.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `Value ${value} has more than ${decimals} decimal places; cannot ` +
        "represent exactly as minor units"
    );
  }

  const paddedFraction = fraction.padEnd(decimals, "0");
  const minorUnits = BigInt(whole + paddedFraction);
  return negative ? -minorUnits : minorUnits;
}
