import { getDriverEnv } from '@/server/env';
import { MemoryMailer } from './memory';
import { SmtpMailer } from './smtp';

export type MailMessage = { to: string; subject: string; text: string; html?: string };

export interface Mailer {
  send(m: MailMessage): Promise<void>;
}

let mailer: Mailer | undefined;

/** Memoized singleton chosen by `MAIL_DRIVER` (`smtp` by default, `memory` in tests). */
export function getMailer(): Mailer {
  mailer ??= getDriverEnv().MAIL_DRIVER === 'memory' ? new MemoryMailer() : new SmtpMailer();
  return mailer;
}

/** Drops the memoized mailer so the next `getMailer()` re-reads `MAIL_DRIVER`. */
export function resetAdaptersForTests(): void {
  mailer = undefined;
}
