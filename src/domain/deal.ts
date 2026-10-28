/**
 * Negotiation rules (H4 minimal), pure and I/O-free.
 *
 * - P7: only the counterparty of the latest pending offer may accept it.
 * - P8: the stepper stage is derived from access + NDA + deal status, never stored.
 * - Offer terms are entered in millions of pesos and validated with `OFFER_SCHEMA`.
 */
import { z } from 'zod';
import type { AccessStatus } from '@/domain/machines/access';
import { dealMachine, type DealEvent, type DealStatus } from '@/domain/machines/deal';
import type { Actor } from '@/domain/roles';

export type DealParty = 'BUYER' | 'SELLER';

/** Mirrors the Prisma `DealStage` enum (pinned in `src/server/db/enums.test.ts`). */
export const DEAL_STAGES = [
  'CONTACT',
  'NDA_SIGNED',
  'OFFER',
  'NEGOTIATION',
  'LOI',
  'DUE_DILIGENCE',
  'CLOSING',
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  CONTACT: 'Contacto',
  NDA_SIGNED: 'NDA',
  OFFER: 'Oferta',
  NEGOTIATION: 'Negociación',
  LOI: 'LOI',
  DUE_DILIGENCE: 'Due diligence',
  CLOSING: 'Cierre',
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  OFFER_SENT: 'Oferta enviada',
  COUNTER_OFFER: 'Contraoferta',
  PRELIMINARY_AGREEMENT: 'Acuerdo preliminar',
  LOI_SIGNED: 'Carta de intención firmada',
  DUE_DILIGENCE: 'Due diligence',
  CLOSED: 'Cerrado',
  WITHDRAWN: 'Desistido',
};

/** P7: an offer can only be accepted by the party that did NOT author it. */
export function canAcceptOffer(lastOfferAuthor: DealParty, actorRole: Actor): boolean {
  return (actorRole === 'BUYER' || actorRole === 'SELLER') && actorRole !== lastOfferAuthor;
}

const STAGE_BY_STATUS: Record<DealStatus, DealStage> = {
  OFFER_SENT: 'OFFER',
  COUNTER_OFFER: 'NEGOTIATION',
  PRELIMINARY_AGREEMENT: 'LOI',
  LOI_SIGNED: 'DUE_DILIGENCE',
  DUE_DILIGENCE: 'DUE_DILIGENCE',
  CLOSED: 'CLOSING',
  // A withdrawn deal has no stage of its own; the UI shows it as ended.
  WITHDRAWN: 'OFFER',
};

/**
 * Stage the process is currently in (P8). Without a deal: `NDA_SIGNED` once the
 * buyer is authorized with a signed NDA, otherwise `CONTACT`. With a deal, the
 * stage follows its status (LOI_SIGNED is already waiting for due diligence).
 */
export function dealStageOf(input: {
  accessStatus: AccessStatus | null;
  ndaSigned: boolean;
  dealStatus: DealStatus | null;
}): DealStage {
  if (input.dealStatus) return STAGE_BY_STATUS[input.dealStatus];
  return input.accessStatus === 'AUTHORIZED' && input.ndaSigned ? 'NDA_SIGNED' : 'CONTACT';
}

/** Actions a party can see in the deal UI (RENEGOTIATE is not offered in the MVP). */
export type DealAction = Exclude<DealEvent, 'RENEGOTIATE'>;

/**
 * Buttons for `party` (null = read-only viewer such as Back Office): the machine's
 * available events, minus ACCEPT when `canAcceptOffer` fails, minus the signature
 * or close confirmation the party already gave.
 */
export function dealActionsFor(input: {
  status: DealStatus;
  party: DealParty | null;
  pendingOfferAuthor: DealParty | null;
  signedLoi: boolean;
  confirmedClose: boolean;
}): DealAction[] {
  const { status, party } = input;
  if (!party) return [];
  return dealMachine.availableEvents(status, party).filter((e): e is DealAction => {
    switch (e) {
      case 'RENEGOTIATE':
        return false;
      case 'ACCEPT':
        return input.pendingOfferAuthor !== null && canAcceptOffer(input.pendingOfferAuthor, party);
      case 'SIGN_LOI':
        return !input.signedLoi;
      case 'CONFIRM_CLOSE':
        return !input.confirmedClose;
      default:
        return true;
    }
  });
}

// ───────────────────────────── offer terms ─────────────────────────────

export const INVESTMENT_TYPES = [
  'Compra total',
  'Compra mayoritaria',
  'Participación minoritaria',
  'Socio estratégico',
  'Capital de crecimiento',
] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

export const OFFER_LIMITS = {
  minPreMoneyMillions: 100,
  maxPreMoneyMillions: 100_000_000,
  maxExclusivityDays: 180,
  maxValidityDays: 180,
  paymentSchemeMin: 5,
  paymentSchemeMax: 120,
} as const;

const DAY_MS = 86_400_000;

/**
 * Offer form schema. `preMoneyValue` is in MILLIONS of pesos (convert with
 * `millions()`); `validUntil` must be in the future and at most 180 days ahead
 * of `now()` (evaluated at parse time).
 */
export function makeOfferSchema(now: () => Date = () => new Date()) {
  return z
    .object({
      preMoneyValue: z.coerce
        .number({ error: 'Escribe la valoración en millones de pesos.' })
        .int('La valoración va en millones, sin decimales.')
        .min(
          OFFER_LIMITS.minPreMoneyMillions,
          `La valoración mínima es COP ${OFFER_LIMITS.minPreMoneyMillions} M.`,
        )
        .max(OFFER_LIMITS.maxPreMoneyMillions, 'La valoración es demasiado alta.'),
      stakePct: z.coerce
        .number({ error: 'Escribe el porcentaje de participación.' })
        .min(1, 'La participación debe ser de al menos 1 %.')
        .max(100, 'La participación no puede superar el 100 %.'),
      investmentType: z.enum(INVESTMENT_TYPES, { error: 'Elige un tipo de inversión.' }),
      paymentScheme: z
        .string()
        .trim()
        .min(
          OFFER_LIMITS.paymentSchemeMin,
          `Describe el esquema de pago en al menos ${OFFER_LIMITS.paymentSchemeMin} caracteres.`,
        )
        .max(
          OFFER_LIMITS.paymentSchemeMax,
          `El esquema de pago puede tener máximo ${OFFER_LIMITS.paymentSchemeMax} caracteres.`,
        ),
      exclusivityDays: z.coerce
        .number({ error: 'Escribe los días de exclusividad.' })
        .int('La exclusividad va en días completos.')
        .min(0, 'La exclusividad no puede ser negativa.')
        .max(
          OFFER_LIMITS.maxExclusivityDays,
          `La exclusividad puede ser de máximo ${OFFER_LIMITS.maxExclusivityDays} días.`,
        ),
      validUntil: z.coerce.date({ error: 'Elige hasta cuándo es válida la oferta.' }),
    })
    .superRefine((v, ctx) => {
      const t = now().getTime();
      const until = v.validUntil.getTime();
      if (until <= t) {
        ctx.addIssue({
          code: 'custom',
          path: ['validUntil'],
          message: 'La fecha de validez debe ser posterior a hoy.',
        });
      } else if (until > t + OFFER_LIMITS.maxValidityDays * DAY_MS) {
        ctx.addIssue({
          code: 'custom',
          path: ['validUntil'],
          message: `La oferta puede tener una validez de máximo ${OFFER_LIMITS.maxValidityDays} días.`,
        });
      }
    });
}

export const OFFER_SCHEMA = makeOfferSchema();
export type OfferTerms = z.output<typeof OFFER_SCHEMA>;
/** Raw form values (strings from the form, or already-typed values); validated by the schema. */
export type OfferInput = { [K in keyof OfferTerms]: unknown };
