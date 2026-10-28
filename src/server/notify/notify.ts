import type { Prisma } from '@prisma/client';
import { getMailer } from '@/server/mail';
import { renderTemplate } from './templates';

export const NOTIFICATION_KINDS = [
  'ONBOARDING_SUBMITTED',
  'ONBOARDING_CORRECTIONS',
  'ONBOARDING_APPROVED',
  'ONBOARDING_REJECTED',
  'ACCOUNT_BLOCKED',
  'ACCOUNT_UNBLOCKED',
  'NEW_USER_TO_REVIEW',
  'OPPORTUNITY_PUBLISHED',
  'OPPORTUNITY_ADJUSTMENTS',
  'OPPORTUNITY_REJECTED',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Inserts the in-app Notification row. Call inside `audited`; it does not send email. */
export async function notify(
  tx: Prisma.TransactionClient,
  n: { userId: string; kind: NotificationKind; payload: Record<string, unknown> },
): Promise<void> {
  await tx.notification.create({
    data: { userId: n.userId, kind: n.kind, payload: n.payload as Prisma.InputJsonObject },
  });
}

/**
 * Sends the templated email for `kind`. Call AFTER the transaction commits.
 * Failures are logged (never with the recipient) and never propagate.
 */
export async function sendTemplatedEmail(
  to: string,
  kind: NotificationKind,
  data: Record<string, string>,
): Promise<void> {
  try {
    const t = renderTemplate(kind, data);
    await getMailer().send({ to, subject: t.subject, text: t.text, html: t.html });
  } catch (err) {
    // Never log err.message: SMTP errors often embed the recipient address.
    const code = (err as { code?: unknown } | null)?.code;
    console.error(
      `[mail] failed to send ${kind}:`,
      err instanceof Error ? err.name : 'UnknownError',
      typeof code === 'string' ? code : undefined,
    );
  }
}
