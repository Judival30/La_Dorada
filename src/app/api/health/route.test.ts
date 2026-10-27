import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock('@/server/db', () => ({ db: { $queryRaw: queryRaw } }));

import { GET } from './route';

describe('GET /api/health', () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it('responds 200 with status ok and db up when SELECT 1 succeeds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'up' });
  });

  it('still responds 200 with db down when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', db: 'down' });
  });
});
