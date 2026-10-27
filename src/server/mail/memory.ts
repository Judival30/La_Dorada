import type { MailMessage, Mailer } from './index';

/** In-memory mailer for unit tests (`MAIL_DRIVER=memory`). */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(m: MailMessage): Promise<void> {
    this.sent.push(m);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
