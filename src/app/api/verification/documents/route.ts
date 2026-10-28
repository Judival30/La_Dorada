import { z } from 'zod';
import { ForbiddenError, ValidationError } from '@/domain/errors';
import { VERIFICATION_DOCUMENT_TYPES } from '@/domain/onboarding';
import { requireApplicant } from '@/server/auth/guard';
import { uploadLimiter } from '@/server/auth/rate-limit';
import { errorResponse } from '@/server/http/errors';
import {
  EDITABLE_STATUSES,
  MAX_DOCUMENT_BYTES,
  uploadVerificationDocument,
} from '@/server/services/onboarding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Whole request cap: the 10 MB file plus room for the multipart envelope. */
const MAX_BODY_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;
const TOO_LARGE = 'El archivo supera el límite de 10 MB.';
const RATE_LIMITED = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Subiste demasiados archivos seguidos. Espera unos minutos e intenta de nuevo.',
  },
} as const;

const fieldsSchema = z.object({
  type: z.enum(VERIFICATION_DOCUMENT_TYPES, { error: 'Tipo de documento inválido.' }),
});

/** Reads the body, aborting as soon as it exceeds `cap` (covers bodies without content-length). */
async function readBodyCapped(req: Request, cap: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!req.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new ValidationError(TOO_LARGE);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Upload (or replace) a verification document: `multipart/form-data` with
 * fields `type` (VerificationDocumentType) and `file`. Reachable before the
 * account is ENABLED, so the guard checks role only and the status rule
 * (PENDING / CORRECTIONS_REQUESTED) is enforced here early and again by the
 * service under the user lock. The declared MIME type is ignored: the service
 * sniffs the bytes. 201 `{ id }`. At most 20 uploads per 10 minutes per user
 * (`uploadLimiter`, checked before the body is read) → 429 `RATE_LIMITED`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const actor = await requireApplicant();
    if (!EDITABLE_STATUSES.includes(actor.status)) {
      throw new ForbiddenError(`Uploads are closed while ${actor.status}`);
    }
    if (!uploadLimiter.take(actor.id)) {
      return Response.json(RATE_LIMITED, { status: 429, headers: { 'retry-after': '600' } });
    }

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new ValidationError('Envía el archivo como multipart/form-data.');
    }
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new ValidationError(TOO_LARGE);
    }

    const body = await readBodyCapped(req, MAX_BODY_BYTES);
    let form: FormData;
    try {
      form = await new Response(body, { headers: { 'content-type': contentType } }).formData();
    } catch {
      throw new ValidationError('No pudimos leer el archivo enviado.');
    }

    const { type } = fieldsSchema.parse({ type: form.get('type') });
    const file = form.get('file');
    if (!(file instanceof File)) throw new ValidationError('Adjunta un archivo.');
    if (file.size > MAX_DOCUMENT_BYTES) throw new ValidationError(TOO_LARGE);

    const bytes = Buffer.from(await file.arrayBuffer());
    const { id } = await uploadVerificationDocument(actor.id, type, { name: file.name, bytes });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
