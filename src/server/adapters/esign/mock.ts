import { createHash } from 'node:crypto';
import { NDA_TEXT, NDA_VERSION } from '@/content/nda';

/**
 * Mock electronic signature (demo only, no external provider). The evidence
 * hash binds the exact NDA text to the request, both parties and the instant:
 * sha256(NDA text + version + accessRequestId + buyerId + opportunityId + signedAt ISO).
 */
export type EsignInput = {
  accessRequestId: string;
  buyerId: string;
  opportunityId: string;
  signedAt: Date;
};

/** NDA validity from the signature instant (spec: 1 year). */
export const NDA_VALIDITY_DAYS = 365;
const DAY_MS = 86_400_000;

export function signNdaDocument(input: EsignInput): {
  documentHash: string;
  signedAt: Date;
  expiresAt: Date;
} {
  const documentHash = createHash('sha256')
    .update(
      [
        NDA_TEXT,
        NDA_VERSION,
        input.accessRequestId,
        input.buyerId,
        input.opportunityId,
        input.signedAt.toISOString(),
      ].join('\n'),
      'utf8',
    )
    .digest('hex');
  return {
    documentHash,
    signedAt: input.signedAt,
    expiresAt: new Date(input.signedAt.getTime() + NDA_VALIDITY_DAYS * DAY_MS),
  };
}
