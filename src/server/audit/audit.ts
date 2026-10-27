import { createHash } from 'node:crypto';
import { Prisma, type AuditLog, type PrismaClient } from '@prisma/client';
import { db } from '@/server/db';

/**
 * Append-only, hash-chained audit log (spec R6).
 *
 * Each row stores `hash = sha256(prevHash + canonicalJson(payload))`, where
 * `prevHash` is the previous row's hash (by `seq`) and `''` for the first row.
 * Writers serialize on a transaction-scoped advisory lock, so the chain order
 * (`seq`) always matches the hash order, even under concurrency.
 */

/** Advisory lock key that serializes audit writers. */
const AUDIT_LOCK_KEY = 7240001;
const VERIFY_BATCH = 500;

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Converts any value to plain JSON: bigint → string, Date → ISO string,
 * `undefined` object keys dropped, `undefined` at the top level → null.
 */
export function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers are not JSON');
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : toJsonValue(v)));
  if (typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = toJsonValue(v);
    }
    return out;
  }
  throw new TypeError(`Unsupported audit value of type ${typeof value}`);
}

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(toJsonValue(value)));
}

function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k] as JsonValue);
    return out;
  }
  return value;
}

type HashInput = {
  at: Date;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
};

export function computeAuditHash(prevHash: string | null, row: HashInput): string {
  const payload = canonicalJson({
    at: row.at,
    actorId: row.actorId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    ip: row.ip,
  });
  return createHash('sha256')
    .update((prevHash ?? '') + payload)
    .digest('hex');
}

function toDbJson(value: JsonValue): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/**
 * Appends one audit row inside the caller's transaction. Must be called with
 * the same `tx` as the audited mutation so both commit or roll back together.
 */
export async function writeAudit(tx: Prisma.TransactionClient, e: AuditEntry): Promise<AuditLog> {
  // Released automatically on commit/rollback.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;

  const last = await tx.auditLog.findFirst({
    orderBy: { seq: 'desc' },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? null;

  // `at` is generated here (not by the DB default) so the hashed value is
  // exactly the stored one. Postgres timestamp(3) keeps JS millisecond precision.
  const at = new Date();
  const before = toJsonValue(e.before);
  const after = toJsonValue(e.after);
  const ip = e.ip ?? null;

  const hash = computeAuditHash(prevHash, {
    at,
    actorId: e.actorId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before,
    after,
    ip,
  });

  return tx.auditLog.create({
    data: {
      at,
      actorId: e.actorId,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      before: toDbJson(before),
      after: toDbJson(after),
      ip,
      prevHash,
      hash,
    },
  });
}

/**
 * Walks the whole chain in `seq` order and recomputes every hash.
 * Returns the id of the first row whose link or hash does not match.
 */
export async function verifyAuditChain(
  client: PrismaClient = db,
): Promise<{ ok: boolean; brokenAt?: string }> {
  let prevHash: string | null = null;
  let cursor: bigint | undefined;

  for (;;) {
    const rows: AuditLog[] = await client.auditLog.findMany({
      where: cursor === undefined ? undefined : { seq: { gt: cursor } },
      orderBy: { seq: 'asc' },
      take: VERIFY_BATCH,
    });
    if (rows.length === 0) return { ok: true };

    for (const row of rows) {
      const expected = computeAuditHash(prevHash, row);
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { ok: false, brokenAt: row.id };
      }
      prevHash = row.hash;
      cursor = row.seq;
    }
  }
}
