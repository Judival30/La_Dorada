/** Type-level mirror of `toDTO`: bigint and Date become string, recursively. */
export type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends readonly (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

function isPlainObject(v: object): v is Record<string, unknown> {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function convert(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === 'object' && value !== null && isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = convert(val);
    }
    return out;
  }
  return value;
}

/**
 * Prepares a value for JSON transport: bigint becomes string and Date becomes
 * an ISO string, recursing through arrays and plain objects. Other values pass through.
 */
export function toDTO<T>(value: T): Serialized<T> {
  return convert(value) as Serialized<T>;
}
