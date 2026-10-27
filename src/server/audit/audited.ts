import { Prisma, type PrismaClient } from '@prisma/client';
import { db } from '@/server/db';
import { writeAudit, type AuditEntry } from './audit';

export type AuditedOutcome<T> = { result: T; audit: AuditEntry | AuditEntry[] };

export type AuditedOptions = {
  /**
   * Only READ COMMITTED is supported: the hash-chained `writeAudit` must see the
   * tail committed by the previous lock holder (see `audit.ts`). Higher levels
   * would fork the chain, so they are not accepted.
   */
  isolationLevel?: typeof Prisma.TransactionIsolationLevel.ReadCommitted;
  timeout?: number;
  maxWait?: number;
  /** Client to open the transaction on. Defaults to the app-wide `db` (the seed passes its own). */
  client?: PrismaClient;
};

/**
 * THE way to mutate (spec R6, §3.1 step 5). Opens a READ COMMITTED transaction,
 * runs `fn` with its `tx`, then appends the returned audit entry (or entries, in
 * order) with `writeAudit(tx, …)` in the SAME transaction, and returns `result`.
 * If `fn` or any audit write throws, everything rolls back together.
 *
 * Do every write inside `fn` through `tx`, never through the global `db`.
 */
export async function audited<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<AuditedOutcome<T>>,
  opts: AuditedOptions = {},
): Promise<T> {
  const { client = db, isolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted } = opts;
  return client.$transaction(
    async (tx) => {
      const { result, audit } = await fn(tx);
      for (const entry of Array.isArray(audit) ? audit : [audit]) {
        await writeAudit(tx, entry);
      }
      return result;
    },
    { isolationLevel, timeout: opts.timeout, maxWait: opts.maxWait },
  );
}
