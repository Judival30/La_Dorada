import nodemailer from 'nodemailer';
import { env } from '@/server/env';
import type { MailMessage, Mailer } from './index';

/** SMTP mailer (Mailpit locally). */
export class SmtpMailer implements Mailer {
  private readonly transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });

  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: env.MAIL_FROM,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
    });
  }
}
