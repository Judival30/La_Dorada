/**
 * Tiny but structurally real files for upload tests (test-only module).
 * Each starts with the format's genuine header bytes.
 */

/** Minimal one-page PDF 1.4. */
function pdf(): Buffer {
  return Buffer.from(
    [
      '%PDF-1.4',
      '%âãÏÓ',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj',
      'trailer << /Root 1 0 R >>',
      '%%EOF',
      '',
    ].join('\n'),
    'latin1',
  );
}

/** JPEG SOI + JFIF APP0 segment + EOI. */
function jpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

/** PNG signature + IHDR chunk header (1×1). */
function png(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
  ]);
}

/** DOS/PE executable stub ("MZ" header). */
function exe(): Buffer {
  const b = Buffer.alloc(128);
  b.write('MZ', 0, 'latin1');
  b.write('This program cannot be run in DOS mode.', 0x4e, 'latin1');
  return b;
}

/** A PDF padded to `bytes` total length. */
function pdfOfSize(bytes: number): Buffer {
  const head = pdf();
  return Buffer.concat([head, Buffer.alloc(Math.max(0, bytes - head.length), 0x20)]);
}

export const fixtures = { pdf, jpeg, png, exe, pdfOfSize };
