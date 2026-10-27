import { PrismaClient } from '@prisma/client';

/**
 * Process-wide PrismaClient. In development Next.js hot-reloads modules, so the
 * instance is cached on `globalThis` to avoid exhausting connections.
 * The client connects lazily on first query; importing this module never
 * opens a connection.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
