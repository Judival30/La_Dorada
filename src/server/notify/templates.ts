import type { NotificationKind } from './notify';

export type EmailTemplate = { subject: string; text: string; html: string };

const escapeHtml = (v: string): string =>
  v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

type Spec = { subject: string; lines: (name: string) => string[] };

const SPECS: Record<NotificationKind, Spec> = {
  ONBOARDING_SUBMITTED: {
    subject: 'Recibimos tu solicitud de verificación',
    lines: (n) => [
      `Hola ${n},`,
      'Recibimos tu información y documentos. El equipo de La Dorada los revisará y te avisaremos por este medio cuando haya una decisión.',
    ],
  },
  ONBOARDING_CORRECTIONS: {
    subject: 'Necesitamos que corrijas tu solicitud',
    lines: (n) => [
      `Hola ${n},`,
      'Revisamos tu solicitud y necesitamos algunas correcciones. Ingresa a La Dorada para ver los detalles y volver a enviarla.',
    ],
  },
  ONBOARDING_APPROVED: {
    subject: 'Tu cuenta fue aprobada',
    lines: (n) => [
      `Hola ${n},`,
      '¡Buenas noticias! Tu verificación fue aprobada y tu cuenta ya está habilitada. Ya puedes ingresar a La Dorada.',
    ],
  },
  ONBOARDING_REJECTED: {
    subject: 'Resultado de tu solicitud de verificación',
    lines: (n) => [
      `Hola ${n},`,
      'Lamentablemente no pudimos aprobar tu solicitud de verificación. Ingresa a La Dorada para conocer el motivo.',
    ],
  },
  ACCOUNT_BLOCKED: {
    subject: 'Tu cuenta fue bloqueada',
    lines: (n) => [
      `Hola ${n},`,
      'Tu cuenta de La Dorada fue bloqueada temporalmente. Si crees que es un error, comunícate con el equipo de soporte.',
    ],
  },
  ACCOUNT_UNBLOCKED: {
    subject: 'Tu cuenta fue desbloqueada',
    lines: (n) => [
      `Hola ${n},`,
      'Tu cuenta de La Dorada fue desbloqueada. Ya puedes volver a ingresar con normalidad.',
    ],
  },
  NEW_USER_TO_REVIEW: {
    subject: 'Hay un nuevo usuario por revisar',
    lines: (n) => [
      `Hola ${n},`,
      'Hay una nueva solicitud de verificación en la cola del Back Office esperando revisión.',
    ],
  },
};

/** Builds subject, plain text and simple HTML for `kind`. Interpolated values are HTML-escaped. */
export function renderTemplate(
  kind: NotificationKind,
  data: Record<string, string>,
): EmailTemplate {
  const spec = SPECS[kind];
  const name = data.name?.trim() || 'usuario';
  const text = [...spec.lines(name), 'Equipo La Dorada'].join('\n\n');
  const html =
    '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1a1a1a">' +
    spec
      .lines(escapeHtml(name))
      .map((l) => `<p>${l}</p>`)
      .join('') +
    '<p>Equipo La Dorada</p></div>';
  return { subject: spec.subject, text, html };
}
