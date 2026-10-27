import { test } from '@playwright/test';
import { login } from '../helpers';

// Visual review helper. Run with: SCREENS=1 pnpm e2e e2e/screens
// Output goes to test-results/screens/ (git-ignored).
test.skip(!process.env.SCREENS, 'Set SCREENS=1 to capture review screenshots');

const SIZES = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '390', width: 390, height: 844 },
] as const;

const OUT = 'test-results/screens';

test('capture public pages', async ({ browser }) => {
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/landing-${s.tag}.png`, fullPage: true });
    await page.goto('/login');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/login-${s.tag}.png`, fullPage: true });
    await ctx.close();
  }
});

const PRIVATE = [
  { email: 'comprador@demo.ladorada.co', path: '/marketplace', name: 'marketplace' },
  { email: 'admin@demo.ladorada.co', path: '/bo', name: 'bo' },
  { email: 'revision@demo.ladorada.co', path: '/onboarding', name: 'onboarding' },
] as const;

for (const p of PRIVATE) {
  test(`capture ${p.name}`, async ({ browser }) => {
    // Sign in once (desktop), reuse the session for the phone viewport.
    const first = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await first.newPage();
    await login(page, p.email);
    await page.waitForURL(`**${p.path}`);
    await page.screenshot({ path: `${OUT}/${p.name}-1440.png`, fullPage: true });
    const state = await first.storageState();
    await first.close();

    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: state,
    });
    const mobile = await phone.newPage();
    await mobile.goto(p.path);
    await mobile.screenshot({ path: `${OUT}/${p.name}-390.png`, fullPage: true });
    if (p.name === 'marketplace') {
      await mobile.getByRole('button', { name: 'Abrir menú' }).click();
      await mobile.screenshot({ path: `${OUT}/marketplace-390-menu.png` });
    }
    await phone.close();
  });
}
