import type { Prisma, ReviewDecisionKind, ReviewSubject } from '@prisma/client';

/**
 * Durable history of Back Office decisions (M3 Task 1). Free text lives here,
 * never in the AuditLog. Call it inside the same `audited` transaction as the
 * decision so both commit or roll back together.
 */
export type RecordDecisionInput = {
  subjectType: ReviewSubject;
  subjectId: string;
  kind: ReviewDecisionKind;
  text?: string | null;
  actorId: string;
};

export async function recordDecision(
  tx: Prisma.TransactionClient,
  input: RecordDecisionInput,
): Promise<void> {
  await tx.reviewDecision.create({
    data: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      kind: input.kind,
      text: input.text ?? null,
      actorId: input.actorId,
    },
  });
}
