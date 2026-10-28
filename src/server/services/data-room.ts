/**
 * Gated data room (spec R2 / §6, H2 minimal).
 *
 * `canAccessConfidential` is the ONLY gate for buyers: listing and download
 * both re-evaluate it from the database on every call (never from a cached
 * flag). Besides authorized buyers, only the owning seller and an ENABLED
 * Back Office user may see the room. Everyone else gets `NotFoundError` (404,
 * never 403) and an `ACCESS_DENIED` audit row written in its own transaction,
 * so a stranger cannot tell a foreign document from a missing one.
 */
import { z } from 'zod';
import { NotFoundError } from '@/domain/errors';
import type { OpportunityStatus } from '@/domain/machines/opportunity';
import { OPPORTUNITY_TYPE_LABELS, type OpportunityType } from '@/domain/opportunity';
import { canAccessConfidential, ndaState, type NdaState } from '@/domain/policies/confidential';
import { SECTOR_LABELS } from '@/domain/sectors';
import { audited } from '@/server/audit/audited';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { getStorage } from '@/server/storage';
import { DOCUMENT_URL_TTL_SECONDS, documentResponseHeaders } from './onboarding';

type Actor = Pick<SessionUser, 'id' | 'role' | 'status'>;
export type DataRoomViewer = 'BUYER' | 'SELLER' | 'BACKOFFICE';

type Gate =
  | { allowed: true; viewer: DataRoomViewer; nda: { expiresAt: Date; state: NdaState } | null }
  | { allowed: false };

/** Latest NDA signature of a buyer's request on an opportunity, plus the request status. */
async function buyerAccess(buyerId: string, opportunityId: string) {
  return db.accessRequest.findUnique({
    where: { buyerId_opportunityId: { buyerId, opportunityId } },
    select: {
      status: true,
      ndaSignatures: {
        select: { signedAt: true, expiresAt: true },
        orderBy: { signedAt: 'desc' },
        take: 1,
      },
    },
  });
}

/**
 * Decides whether `actor` may see the opportunity's confidential documents.
 * Owner seller / Back Office: by role (any status). Buyers: `canAccessConfidential`.
 */
async function evaluateGate(
  actor: Actor,
  opportunity: { id: string; sellerId: string; status: OpportunityStatus },
  now: Date,
): Promise<Gate> {
  if (actor.status !== 'ENABLED') return { allowed: false };
  if (actor.role === 'BACKOFFICE') return { allowed: true, viewer: 'BACKOFFICE', nda: null };
  if (actor.role === 'SELLER') {
    return opportunity.sellerId === actor.id
      ? { allowed: true, viewer: 'SELLER', nda: null }
      : { allowed: false };
  }
  const access = await buyerAccess(actor.id, opportunity.id);
  const nda = access?.ndaSignatures[0] ?? null;
  const ok = canAccessConfidential({
    user: { id: actor.id, role: actor.role, status: actor.status },
    opportunity: { sellerId: opportunity.sellerId, status: opportunity.status },
    access: access ? { status: access.status } : null,
    nda,
    now,
  });
  return ok && nda
    ? {
        allowed: true,
        viewer: 'BUYER',
        nda: { expiresAt: nda.expiresAt, state: ndaState(nda, now) },
      }
    : { allowed: false };
}

async function auditDenied(
  actor: Actor,
  entity: 'Document' | 'Opportunity',
  entityId: string,
  after: Record<string, string | null>,
): Promise<void> {
  await audited(async () => ({
    result: undefined,
    audit: { actorId: actor.id, action: 'ACCESS_DENIED', entity, entityId, after },
  }));
}

const idSchema = z.string().min(1).max(64);

export type DataRoomDocument = {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: Date;
};

export type DataRoomView = {
  viewer: DataRoomViewer;
  opportunity: {
    id: string;
    title: string;
    /** Confidential: shown only inside the gated room. */
    legalName: string;
    sectorLabel: string;
    department: string;
    typeLabel: string;
  };
  nda: { expiresAt: Date } | null;
  folders: { id: string; name: string; required: boolean; documents: DataRoomDocument[] }[];
  totals: { folders: number; documents: number; bytes: number };
};

/** Folders and documents (metadata only, never storage keys or URLs). Denied → audited 404. */
export async function getDataRoom(
  actor: Actor,
  opportunityId: string,
  now: Date = new Date(),
): Promise<DataRoomView> {
  const id = idSchema.safeParse(opportunityId);
  if (!id.success) throw new NotFoundError();
  const opp = await db.opportunity.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      sellerId: true,
      company: {
        select: { sector: true, department: true, organization: { select: { name: true } } },
      },
    },
  });
  const gate = opp ? await evaluateGate(actor, opp, now) : ({ allowed: false } as const);
  if (!opp || !gate.allowed) {
    await auditDenied(actor, 'Opportunity', id.data, { opportunityId: id.data });
    throw new NotFoundError();
  }

  const folders = await db.dataRoomFolder.findMany({
    where: { opportunityId: opp.id },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      required: true,
      documents: {
        where: { opportunityId: opp.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: { id: true, name: true, size: true, mime: true, createdAt: true },
      },
    },
  });

  const documents = folders.flatMap((f) => f.documents);
  return {
    viewer: gate.viewer,
    opportunity: {
      id: opp.id,
      title: opp.title,
      legalName: opp.company.organization.name,
      sectorLabel: SECTOR_LABELS[opp.company.sector],
      department: opp.company.department,
      typeLabel: OPPORTUNITY_TYPE_LABELS[opp.type as OpportunityType].label,
    },
    nda: gate.nda ? { expiresAt: gate.nda.expiresAt } : null,
    folders,
    totals: {
      folders: folders.length,
      documents: documents.length,
      bytes: documents.reduce((a, d) => a + d.size, 0),
    },
  };
}

const OFFICE_EXT: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

/**
 * Forced response headers for a data room read. PDF / JPEG / PNG reuse the
 * verification-document helper; Office files and anything unexpected are
 * attachments with a fixed name (never the uploader's file name).
 */
export function dataRoomResponseHeaders(mime: string): {
  contentType: string;
  disposition: string;
} {
  if (mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png') {
    return documentResponseHeaders(mime);
  }
  const ext = OFFICE_EXT[mime];
  return ext
    ? { contentType: mime, disposition: `attachment; filename="documento.${ext}"` }
    : { contentType: 'application/octet-stream', disposition: 'attachment; filename="documento"' };
}

/**
 * 60 s signed URL for one data room document. Re-evaluates the gate on every
 * call; allowed → `DOCUMENT_DOWNLOADED`, otherwise `ACCESS_DENIED` (own
 * transaction) and `NotFoundError`. Audit payloads carry only ids.
 */
export async function documentDownloadUrl(
  actor: Actor,
  documentId: string,
  now: Date = new Date(),
): Promise<string> {
  const id = idSchema.safeParse(documentId);
  if (!id.success) throw new NotFoundError();
  const doc = await db.document.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      storageKey: true,
      mime: true,
      opportunityId: true,
      opportunity: { select: { id: true, sellerId: true, status: true } },
    },
  });
  const opportunityId = doc?.opportunityId ?? null;
  const gate = doc?.opportunity ? await evaluateGate(actor, doc.opportunity, now) : null;
  if (!doc || !gate?.allowed) {
    await auditDenied(actor, 'Document', id.data, { documentId: id.data, opportunityId });
    throw new NotFoundError();
  }

  await audited(async () => ({
    result: undefined,
    audit: {
      actorId: actor.id,
      action: 'DOCUMENT_DOWNLOADED',
      entity: 'Document',
      entityId: doc.id,
      after: { documentId: doc.id, opportunityId },
    },
  }));
  return getStorage().presignGet(
    doc.storageKey,
    DOCUMENT_URL_TTL_SECONDS,
    dataRoomResponseHeaders(doc.mime),
  );
}
