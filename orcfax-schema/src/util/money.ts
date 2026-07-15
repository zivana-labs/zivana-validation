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

/** ISO 4217 minor-unit exponents that differ from the common default of 2
 * (e.g. JPY/KRW/VND have no minor unit at all; BHD/KWD/OMR/JOD use 3).
 * Not exhaustive, just the well-known exceptions; anything absent here
 * falls back to 2 in `minorUnitDecimalsFor`. */
const CURRENCY_DECIMAL_EXCEPTIONS: Record<string, number> = {
  BHD: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export function minorUnitDecimalsFor(currency: string): number {
  return CURRENCY_DECIMAL_EXCEPTIONS[currency.toUpperCase()] ?? 2;
}

/** Converts an integer count of minor units back to a decimal string,
 * without floating-point division (`Number(bigint) / 100` loses precision
 * above ~2^53 and silently assumes 2 decimal places regardless of
 * currency). Returns a string, not a number, since the whole point is to
 * avoid the precision loss a `number` would reintroduce for large amounts. */
export function fromMinorUnits(amountMinorUnits: bigint, decimals = 2): string {
  const negative = amountMinorUnits < 0n;
  const abs = negative ? -amountMinorUnits : amountMinorUnits;

  if (decimals === 0) {
    return (negative ? "-" : "") + abs.toString();
  }

  const digits = abs.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);
  return (negative ? "-" : "") + whole + "." + fraction;
}
