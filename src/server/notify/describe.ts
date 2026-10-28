import type { NotificationKind } from './notify';

export type NotificationText = { title: string; href: string | null };

type Payload = Record<string, unknown>;

const str = (p: Payload, key: string): string | null =>
  typeof p[key] === 'string' && p[key] !== '' ? (p[key] as string) : null;

/**
 * In-app text and link for a notification. `opportunityTitle` is the public
 * codename (never the legal name); it is resolved by the caller from
 * `payload.opportunityId`.
 */
export function describeNotification(
  kind: NotificationKind,
  payload: Payload,
  opportunityTitle: string | null,
): NotificationText {
  const opp = opportunityTitle ? ` «${opportunityTitle}»` : '';
  const oppId = str(payload, 'opportunityId');
  const dealId = str(payload, 'dealId');
  const deal = dealId ? `/processes/${dealId}` : null;
  const teaser = oppId ? `/opportunities/${oppId}` : null;

  switch (kind) {
    case 'ONBOARDING_SUBMITTED':
      return { title: 'Recibimos tu solicitud de verificación', href: null };
    case 'ONBOARDING_CORRECTIONS':
      return { title: 'Tu solicitud de verificación necesita correcciones', href: null };
    case 'ONBOARDING_APPROVED':
      return { title: 'Tu cuenta fue aprobada', href: null };
    case 'ONBOARDING_REJECTED':
      return { title: 'Tu solicitud de verificación no fue aprobada', href: null };
    case 'ACCOUNT_BLOCKED':
      return { title: 'Tu cuenta fue bloqueada', href: null };
    case 'ACCOUNT_UNBLOCKED':
      return { title: 'Tu cuenta fue desbloqueada', href: null };
    case 'NEW_USER_TO_REVIEW': {
      const userId = str(payload, 'userId');
      return {
        title: 'Hay un nuevo usuario por revisar',
        href: userId ? `/bo/users/${userId}` : '/bo/users',
      };
    }
    case 'OPPORTUNITY_PUBLISHED':
      return { title: `Tu oportunidad${opp} fue publicada`, href: '/seller' };
    case 'OPPORTUNITY_ADJUSTMENTS':
      return {
        title: `El Back Office pidió ajustes en${opp || ' tu oportunidad'}`,
        href: '/seller',
      };
    case 'OPPORTUNITY_REJECTED':
      return { title: `Tu oportunidad${opp} no fue aprobada`, href: '/seller' };
    case 'ACCESS_REQUESTED':
      return {
        title: `Nueva solicitud de acceso a${opp || ' tu oportunidad'}`,
        href: '/seller/access-requests',
      };
    case 'NDA_SIGNED':
      return {
        title: `Un comprador firmó el NDA de${opp || ' tu oportunidad'}`,
        href: '/seller/access-requests',
      };
    case 'ACCESS_APPROVED':
      return { title: `El vendedor autorizó tu acceso a${opp || ' la oportunidad'}`, href: teaser };
    case 'ACCESS_REJECTED':
      return {
        title: `El vendedor no autorizó tu acceso a${opp || ' la oportunidad'}`,
        href: teaser,
      };
    case 'ACCESS_REVOKED':
      return { title: `Tu acceso a${opp || ' la oportunidad'} fue revocado`, href: teaser };
    case 'DEAL_OFFER_RECEIVED':
      return { title: `Recibiste una propuesta en${opp || ' un proceso'}`, href: deal };
    case 'DEAL_OFFER_ACCEPTED':
      return { title: `Aceptaron tu propuesta en${opp || ' un proceso'}`, href: deal };
    case 'DEAL_LOI_SIGNED':
      return {
        title: `La contraparte firmó la carta de intención de${opp || ' un proceso'}`,
        href: deal,
      };
    case 'DEAL_DD_STARTED':
      return { title: `Inició la due diligence de${opp || ' un proceso'}`, href: deal };
    case 'DEAL_CLOSE_CONFIRMED':
      return { title: `La contraparte confirmó el cierre de${opp || ' un proceso'}`, href: deal };
    case 'DEAL_CLOSED':
      return { title: `Transacción cerrada:${opp || ' un proceso'}`, href: deal };
    case 'DEAL_WITHDRAWN':
      return { title: `La contraparte desistió de${opp || ' un proceso'}`, href: deal };
  }
}
