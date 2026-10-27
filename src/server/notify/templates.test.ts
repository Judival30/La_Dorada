import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMailer, resetAdaptersForTests } from '@/server/mail';
import type { MemoryMailer } from '@/server/mail/memory';
import { NOTIFICATION_KINDS, sendTemplatedEmail } from './notify';
import { renderTemplate } from './templates';

describe('templates', () => {
  it('renders every kind with subject, text and html', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const t = renderTemplate(kind, { name: 'Ana' });
      expect(t.subject.length).toBeGreaterThan(0);
      expect(t.text.length).toBeGreaterThan(0);
      expect(t.html).toContain('<');
    }
  });

  it('escapes interpolated values in html', () => {
    const t = renderTemplate('ONBOARDING_CORRECTIONS', { name: '<script>alert(1)</script>' });
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;');
  });
});

describe('sendTemplatedEmail', () => {
  beforeEach(() => {
    process.env.MAIL_DRIVER = 'memory';
    resetAdaptersForTests();
  });
  afterEach(() => {
    delete process.env.MAIL_DRIVER;
    resetAdaptersForTests();
    vi.restoreAllMocks();
  });

  it('sends via the mailer', async () => {
    await sendTemplatedEmail('ana@example.com', 'ONBOARDING_APPROVED', { name: 'Ana' });
    const mailer = getMailer() as MemoryMailer;
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('ana@example.com');
  });

  it('swallows failures and logs without the recipient', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(getMailer(), 'send').mockRejectedValue(new Error('smtp down'));
    await expect(
      sendTemplatedEmail('secreto@example.com', 'ACCOUNT_BLOCKED', {}),
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain('secreto@example.com');
  });
});
