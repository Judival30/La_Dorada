import { getCurrentUser, requireActor, requireApplicant } from '@/server/auth/guard';
import { errorResponse } from '@/server/http/errors';
import { deleteVerificationDocument, documentReadUrl } from '@/server/services/onboarding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/**
 * 302 to a 60 s signed URL for the document's owner (any status) or an ENABLED
 * BACKOFFICE user; audited as VERIFICATION_DOCUMENT_VIEWED. Anyone else gets
 * 404, never 403, so the response does not reveal whether the id exists.
 *
 * Guard: ENABLED users (owner applicants and BACKOFFICE) pass `requireActor()`;
 * everyone else must be an applicant (`requireApplicant()`: BUYER/SELLER in a
 * non-ENABLED status). Ownership is checked by `documentReadUrl`. The signed
 * URL forces the stored mime and a fixed download name (never the user's).
 */
export async function GET(_req: Request, { params }: Context): Promise<Response> {
  try {
    const current = await getCurrentUser();
    const actor = current?.status === 'ENABLED' ? await requireActor() : await requireApplicant();
    const { id } = await params;
    const url = await documentReadUrl(actor, id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Owner-only delete while PENDING / CORRECTIONS_REQUESTED (403 otherwise); foreign id → 404. 204. */
export async function DELETE(_req: Request, { params }: Context): Promise<Response> {
  try {
    const actor = await requireApplicant();
    const { id } = await params;
    await deleteVerificationDocument(actor.id, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
