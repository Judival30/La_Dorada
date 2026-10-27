const PESOS_PER_MILLION = 1_000_000n;

/** Converts a number of millions of pesos to an exact bigint amount in pesos. */
export function millions(m: number): bigint {
  if (!Number.isFinite(m)) {
    throw new RangeError(`millions() requires a finite number, got ${m}`);
  }
  return BigInt(Math.round(m * 1_000_000));
}

/** Groups a non-negative bigint with `.` as thousands separator, without Intl. */
function groupThousands(n: bigint): string {
  const digits = n.toString();
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return out;
}

/**
 * Formats an amount in pesos as Colombian COP.
 * Amounts with |pesos| >= 1.000.000 are shown in millions (rounded half away
 * from zero); smaller amounts are shown in full. Uses bigint math only.
 */
export function formatCOP(pesos: bigint): string {
  const negative = pesos < 0n;
  const abs = negative ? -pesos : pesos;
  const sign = negative ? '-' : '';

  if (abs >= PESOS_PER_MILLION) {
    const roundedMillions = (abs + PESOS_PER_MILLION / 2n) / PESOS_PER_MILLION;
    return `${sign}COP ${groupThousands(roundedMillions)} M`;
  }
  return `${sign}COP ${groupThousands(abs)}`;
}
