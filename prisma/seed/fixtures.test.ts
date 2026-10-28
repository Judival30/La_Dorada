import { describe, expect, it } from 'vitest';
import { sniffMime } from '../../src/server/files/sniff';
import { samplePdf, samplePng } from './fixtures';

describe('seed fixtures', () => {
  it('PDF is small, sniffs as PDF and carries the fictional notice', () => {
    const pdf = samplePdf();
    expect(pdf.length).toBeLessThan(5 * 1024);
    expect(sniffMime(pdf)).toBe('application/pdf');
    expect(pdf.toString('latin1')).toContain('DOCUMENTO DE DEMOSTRACION - FICTICIO');
  });

  it('PNG is small and sniffs as PNG', () => {
    const png = samplePng();
    expect(png.length).toBeLessThan(5 * 1024);
    expect(sniffMime(png)).toBe('image/png');
  });
});
