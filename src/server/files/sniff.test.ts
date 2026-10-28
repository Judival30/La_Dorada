import { describe, expect, it } from 'vitest';
import { sanitizeFileName, sniffMime } from './sniff';
import { fixtures } from '@/test/file-fixtures';

describe('sniffMime', () => {
  it('recognizes real PDF, JPEG and PNG headers', () => {
    expect(sniffMime(fixtures.pdf())).toBe('application/pdf');
    expect(sniffMime(fixtures.jpeg())).toBe('image/jpeg');
    expect(sniffMime(fixtures.png())).toBe('image/png');
  });

  it('rejects plain text and a Windows executable (MZ)', () => {
    expect(sniffMime(Buffer.from('hola, esto es texto plano'))).toBeNull();
    expect(sniffMime(fixtures.exe())).toBeNull();
  });

  it('rejects empty, truncated and look-alike headers', () => {
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    expect(sniffMime(Buffer.from('%PD'))).toBeNull();
    expect(sniffMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a]))).toBeNull();
    // The PDF magic must be at offset 0, not merely somewhere in the file.
    expect(sniffMime(Buffer.concat([Buffer.from('MZ'), fixtures.pdf()]))).toBeNull();
    // An HTML page claiming to be a PDF.
    expect(sniffMime(Buffer.from('<html>%PDF-1.7</html>'))).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('keeps only the base name and strips path separators', () => {
    expect(sanitizeFileName('C:\\Users\\ana\\cedula.pdf')).toBe('cedula.pdf');
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('rut.pdf')).toBe('rut.pdf');
  });

  it('drops control characters and truncates to 120 characters', () => {
    expect(sanitizeFileName('ce\u0000du\nla.pdf')).toBe('cedula.pdf');
    const long = `${'a'.repeat(200)}.pdf`;
    expect(sanitizeFileName(long)).toHaveLength(120);
  });

  it('drops bidi/format characters (U+202E) and C1 controls', () => {
    // "cedula‮fdp.exe" would render as "cedulaexe.pdf" in a bidi-aware UI.
    expect(sanitizeFileName('cedula‮fdp.exe')).toBe('cedulafdp.exe');
    expect(sanitizeFileName('a​b⁦c﻿.pdf')).toBe('abc.pdf');
    expect(sanitizeFileName('rut.pdf')).toBe('rut.pdf');
  });

  it('falls back to "documento" when nothing is left', () => {
    expect(sanitizeFileName('')).toBe('documento');
    expect(sanitizeFileName('///')).toBe('documento');
    expect(sanitizeFileName('  ')).toBe('documento');
  });
});
