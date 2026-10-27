/**
 * R6: deleting a parent must never wipe negotiation/legal evidence. Deleting a
 * Company whose Opportunity has an AccessRequest with a signed NDA must fail
 * with a foreign-key error and leave the NdaSignature intact.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';

const tag = randomUUID().slice(0, 8);
const ids = {} as {
  org: string;
  seller: string;
  buyer: string;
  company: string;
  opportunity: string;
  access: string;
  nda: string;
};

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);

  const org = await db.organization.create({
    data: { name: `Empresa Demo ${tag}`, nit: `900.${tag}`, kind: 'COMPANY' },
  });
  const seller = await db.user.create({
    data: {
      email: `seller-${tag}@demo.ladorada.co`,
      passwordHash: 'x',
      name: 'Vendedor Demo',
      role: 'SELLER',
      status: 'ENABLED',
      organizationId: org.id,
    },
  });
  const buyer = await db.user.create({
    data: {
      email: `buyer-${tag}@demo.ladorada.co`,
      passwordHash: 'x',
      name: 'Comprador Demo',
      role: 'BUYER',
      status: 'ENABLED',
    },
  });
  const company = await db.company.create({
    data: {
      organizationId: org.id,
      sector: 'LOGISTICA',
      department: 'Valle del Cauca',
      city: 'Cali',
      description: 'Empresa ficticia de prueba',
    },
  });
  const opportunity = await db.opportunity.create({
    data: {
      companyId: company.id,
      sellerId: seller.id,
      title: 'Proyecto Prueba',
      type: 'VENTA_TOTAL',
      objective: 'Prueba',
      status: 'PUBLISHED',
    },
  });
  const access = await db.accessRequest.create({
    data: {
      buyerId: buyer.id,
      opportunityId: opportunity.id,
      purpose: 'Evaluar adquisición',
      relevance: 80,
      status: 'NDA_SIGNED',
    },
  });
  const nda = await db.ndaSignature.create({
    data: {
      accessRequestId: access.id,
      documentHash: 'a'.repeat(64),
      signedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
    },
  });
  Object.assign(ids, {
    org: org.id,
    seller: seller.id,
    buyer: buyer.id,
    company: company.id,
    opportunity: opportunity.id,
    access: access.id,
    nda: nda.id,
  });
});

afterAll(async () => {
  // Children first: Restrict forbids the reverse order.
  await db.ndaSignature.deleteMany({ where: { id: ids.nda } });
  await db.accessRequest.deleteMany({ where: { id: ids.access } });
  await db.opportunity.deleteMany({ where: { id: ids.opportunity } });
  await db.company.deleteMany({ where: { id: ids.company } });
  await db.user.deleteMany({ where: { id: { in: [ids.seller, ids.buyer] } } });
  await db.organization.deleteMany({ where: { id: ids.org } });
  await db.$disconnect();
});

describe('evidence is protected by ON DELETE RESTRICT', () => {
  it('deleting the Company fails with a foreign-key error and keeps the NDA', async () => {
    await expect(db.company.delete({ where: { id: ids.company } })).rejects.toThrow(
      /Foreign key constraint/i,
    );
    expect(await db.ndaSignature.findUnique({ where: { id: ids.nda } })).not.toBeNull();
  });

  it('deleting the Organization or the buyer User also fails', async () => {
    await expect(db.organization.delete({ where: { id: ids.org } })).rejects.toThrow(
      /Foreign key constraint/i,
    );
    await expect(db.user.delete({ where: { id: ids.buyer } })).rejects.toThrow(
      /Foreign key constraint/i,
    );
    expect(await db.ndaSignature.count({ where: { id: ids.nda } })).toBe(1);
    expect(await db.accessRequest.count({ where: { id: ids.access } })).toBe(1);
  });
});
