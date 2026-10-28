import { requireActor } from '@/server/auth/guard';
import { errorResponse } from '@/server/http/errors';
import { documentDownloadUrl } from '@/server/services/data-room';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

/**
 * Data room download (spec R2). Any ENABLED user may call it; the service
 * re-evaluates `canAccessConfidential` (or owner seller / Back Office) on every
 * request. Allowed → 302 to a 60 s signed URL with forced Content-Type /
 * Content-Disposition, audited `DOCUMENT_DOWNLOADED`. Anyone else → 404 (never
 * 403) plus an `ACCESS_DENIED` audit row, so direct URLs reveal nothing.
 */
export async function GET(_req: Request, { params }: Context): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await params;
    const url = await documentDownloadUrl(actor, id);
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
