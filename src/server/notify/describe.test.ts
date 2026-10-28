import { describe, expect, it } from 'vitest';
import { describeNotification } from './describe';
import { NOTIFICATION_KINDS } from './notify';

describe('describeNotification', () => {
  it('has a non-empty title for every kind', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(describeNotification(kind, {}, null).title.length).toBeGreaterThan(5);
    }
  });

  it('links deal notifications to the process', () => {
    const t = describeNotification('DEAL_OFFER_RECEIVED', { dealId: 'd1' }, 'Café del Valle');
    expect(t.href).toBe('/processes/d1');
    expect(t.title).toContain('«Café del Valle»');
  });

  it('links access decisions to the teaser', () => {
    expect(describeNotification('ACCESS_APPROVED', { opportunityId: 'o1' }, null).href).toBe(
      '/opportunities/o1',
    );
  });

  it('ignores non-string payload values', () => {
    expect(describeNotification('DEAL_CLOSED', { dealId: 42 }, null).href).toBeNull();
  });
});
