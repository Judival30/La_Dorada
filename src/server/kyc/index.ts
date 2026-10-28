import { MockKycProvider } from './mock';

/** Who is screened against restrictive lists (SARLAFT, OFAC…). No document numbers. */
export type KycSubject = { name: string; documentType: string };

export type KycScreeningResult = {
  /** List hits; empty means "sin coincidencias". */
  matches: string[];
  provider: 'mock';
  checkedAt: Date;
};

/** Restrictive-lists screening adapter. M2 ships only the mock; a real provider plugs in here. */
export interface KycProvider {
  screen(subject: KycSubject): Promise<KycScreeningResult>;
}

let provider: KycProvider | undefined;

/** Memoized KYC provider (always the mock in M2). */
export function getKycProvider(): KycProvider {
  provider ??= new MockKycProvider();
  return provider;
}
