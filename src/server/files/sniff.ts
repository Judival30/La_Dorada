/**
 * File-type detection by magic bytes. The declared Content-Type and the file
 * extension are client-controlled and never trusted for verification uploads.
 */

export type SniffedMime = 'application/pdf' | 'image/jpeg' | 'image/png';

const SIGNATURES: { mime: SniffedMime; bytes: readonly number[] }[] = [
  // "%PDF-"
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // SOI + the first marker's 0xFF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // \x89 P N G \r \n \x1A \n
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Returns the allowed MIME type whose signature starts `bytes` at offset 0, else `null`. */
export function sniffMime(bytes: Buffer): SniffedMime | null {
  for (const sig of SIGNATURES) {
    if (bytes.length >= sig.bytes.length && sig.bytes.every((b, i) => bytes[i] === b)) {
      return sig.mime;
    }
  }
  return null;
}

export const MAX_FILE_NAME_LENGTH = 120;

/**
 * Display-only name: the base name after the last `/` or `\`, without C0/C1
 * control characters and without Unicode format characters (`\p{Cf}`: bidi
 * overrides such as U+202E, zero-width characters, BOM), trimmed and cut to 120
 * characters. Never used to build a storage key (those are random) nor as a
 * download file name (that one is fixed).
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f-\u009f]|\p{Cf}/gu, '').trim();
  return clean.slice(0, MAX_FILE_NAME_LENGTH) || 'documento';
}
