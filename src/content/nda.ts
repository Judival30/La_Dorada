import { createHash } from 'node:crypto';

/**
 * Demo NDA (acuerdo de confidencialidad). Reference text only, fictional:
 * it must be reviewed by legal counsel before production. The signature
 * stores `NDA_HASH` (sha256 of this exact text) so the signed version is
 * verifiable. Changing a single character changes the hash.
 */
export const NDA_VERSION = '2026-demo-1';

export const NDA_TEXT = `ACUERDO DE CONFIDENCIALIDAD (NDA) - TEXTO DE DEMOSTRACION

Entre el VENDEDOR de la oportunidad publicada en La Dorada y el COMPRADOR que firma este acuerdo electrónicamente, se acuerda lo siguiente:

1. Información confidencial. Es toda la información del data room y de las comunicaciones del proceso: estados financieros, contratos, clientes, proveedores, planes y cualquier dato que identifique a la empresa.

2. Uso permitido. El COMPRADOR usará la información únicamente para evaluar una posible transacción con la empresa y no la usará para competir, captar clientes o empleados, ni para ningún otro fin.

3. No divulgación. El COMPRADOR no revelará la información a terceros, salvo a sus asesores que la necesiten para evaluar la transacción y que estén obligados a reservarla.

4. Vigencia. Esta obligación rige durante un (1) año desde la firma electrónica y se mantiene respecto de la información que constituya secreto empresarial.

5. Devolución. Al terminar el proceso, o cuando el VENDEDOR lo solicite, el COMPRADOR dejará de usar la información y eliminará las copias en su poder.

6. Firma electrónica. La aceptación por medios electrónicos tiene plena validez (Ley 527 de 1999). La Dorada registra la fecha, la dirección IP y la huella (hash) de este texto como evidencia de la firma.

Documento ficticio, solo para fines de demostración.`;

/** sha256 (hex) of `NDA_TEXT`. */
export function ndaHash(text: string = NDA_TEXT): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export const NDA_HASH = ndaHash();
