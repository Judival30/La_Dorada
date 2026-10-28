/**
 * Tiny, clearly fictional sample files for the demo verification documents.
 * Generated in code so no binaries are committed. Both pass `sniffMime`.
 */

export type SampleFile = { bytes: Buffer; mime: 'application/pdf' | 'image/png' };

const PDF_TEXT = 'DOCUMENTO DE DEMOSTRACION - FICTICIO';

/** Minimal valid one-page PDF (xref offsets computed) with the fictional notice. */
export function samplePdf(): Buffer {
  const stream = `BT /F1 18 Tf 50 100 Td (${PDF_TEXT}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Valid 1x1 PNG. */
export function samplePng(): Buffer {
  return Buffer.from(PNG_BASE64, 'base64');
}

export function sampleFile(kind: 'pdf' | 'png'): SampleFile {
  return kind === 'pdf'
    ? { bytes: samplePdf(), mime: 'application/pdf' }
    : { bytes: samplePng(), mime: 'image/png' };
}
