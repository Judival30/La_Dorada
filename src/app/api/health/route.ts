import { NextResponse } from 'next/server';
import { db } from '@/server/db';

// Must run per request: never prerender the DB probe at build time.
export const dynamic = 'force-dynamic';

/** Liveness + DB probe. Always 200; `db` reports whether `SELECT 1` succeeded. */
export async function GET() {
  let dbStatus: 'up' | 'down' = 'down';
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = 'up';
  } catch {
    dbStatus = 'down';
  }
  return NextResponse.json({ status: 'ok', db: dbStatus });
}
