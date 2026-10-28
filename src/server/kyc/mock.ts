import type { KycProvider, KycScreeningResult } from './index';

/**
 * Demo screening: never calls anything external and always reports no
 * matches, whatever the subject (so it takes no parameter).
 */
export class MockKycProvider implements KycProvider {
  async screen(): Promise<KycScreeningResult> {
    return { matches: [], provider: 'mock', checkedAt: new Date() };
  }
}
