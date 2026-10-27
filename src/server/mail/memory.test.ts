import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryMailer } from './memory';

describe('MemoryMailer', () => {
  let mailer: MemoryMailer;
  beforeEach(() => {
    mailer = new MemoryMailer();
  });

  it('stores sent messages in order', async () => {
    await mailer.send({ to: 'a@example.com', subject: 'Uno', text: 'hola' });
    await mailer.send({ to: 'b@example.com', subject: 'Dos', text: 'chao', html: '<p>chao</p>' });
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[0]).toMatchObject({ to: 'a@example.com', subject: 'Uno' });
    expect(mailer.sent[1]?.html).toBe('<p>chao</p>');
  });

  it('clear() empties the outbox', async () => {
    await mailer.send({ to: 'a@example.com', subject: 'Uno', text: 'hola' });
    mailer.clear();
    expect(mailer.sent).toEqual([]);
  });
});
