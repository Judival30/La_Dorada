import { createHash } from 'node:crypto';
import { formatCOP } from '@/domain/money';

/**
 * Demo letter of intent (carta de intención). Reference text only, NOT binding
 * and fictional: it must be reviewed by legal counsel before production. The
 * text is rebuilt deterministically from the accepted offer, and `Loi.documentHash`
 * stores sha256 of that exact text, so any change to the terms changes the hash.
 */
export const LOI_VERSION = '2026-demo-1';

export type LoiTerms = {
  dealId: string;
  offerId: string;
  opportunityTitle: string;
  preMoneyValue: bigint;
  stakePct: number;
  investmentType: string;
  paymentScheme: string;
  exclusivityDays: number;
  validUntil: Date;
};

/** "30 nov 2026" in Bogotá time, built without Intl so the text never depends on the ICU build. */
function dayOf(d: Date): string {
  const MONTHS = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sept',
    'oct',
    'nov',
    'dic',
  ];
  const bogota = new Date(d.getTime() - 5 * 3_600_000);
  return `${bogota.getUTCDate()} ${MONTHS[bogota.getUTCMonth()]} ${bogota.getUTCFullYear()}`;
}

const pct = (n: number): string => `${String(n).replace('.', ',')} %`;

export function loiText(t: LoiTerms): string {
  return `CARTA DE INTENCIÓN (LOI) - DOCUMENTO DE REFERENCIA, NO VINCULANTE

Oportunidad: ${t.opportunityTitle}
Proceso: ${t.dealId}
Oferta aceptada: ${t.offerId}
Versión del texto: ${LOI_VERSION}

El COMPRADOR y el VENDEDOR que participan en este proceso en La Dorada dejan constancia de su intención de avanzar hacia una transacción en los siguientes términos:

1. Valoración de la empresa (pre-money): ${formatCOP(t.preMoneyValue)}.

2. Participación a adquirir: ${pct(t.stakePct)}.

3. Tipo de inversión: ${t.investmentType}.

4. Esquema de pago: ${t.paymentScheme}.

5. Exclusividad: ${t.exclusivityDays} días desde la firma de ambas partes, durante los cuales el VENDEDOR no negociará la misma participación con terceros.

6. Due diligence. La transacción queda sujeta a una revisión legal, financiera y comercial satisfactoria por parte del COMPRADOR.

7. Carácter no vinculante. Esta carta expresa una intención y no obliga a ninguna de las partes a cerrar la transacción. Las obligaciones definitivas solo nacerán de los contratos que las partes firmen al cierre. Cualquiera de las partes puede desistir del proceso.

8. Confidencialidad. Se mantiene vigente el acuerdo de confidencialidad firmado por el COMPRADOR.

Términos ofrecidos con validez hasta el ${dayOf(t.validUntil)}.

Documento ficticio, solo para fines de demostración. No es asesoría legal ni financiera.`;
}

/** sha256 (hex) of the LOI text. */
export function loiHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
