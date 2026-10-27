import { expect, test } from '@playwright/test';
import { NAV } from '../../src/config/nav';
import { DEMO_PASSWORD, login } from '../helpers';

type Role = keyof typeof NAV;

const ACCOUNTS: { email: string; role: Role; home: string }[] = [
  { email: 'comprador@demo.ladorada.co', role: 'BUYER', home: '/marketplace' },
  { email: 'vendedor@demo.ladorada.co', role: 'SELLER', home: '/seller' },
  { email: 'admin@demo.ladorada.co', role: 'BACKOFFICE', home: '/bo' },
];

test.describe.configure({ mode: 'serial' });

test.describe('login by role', () => {
  for (const account of ACCOUNTS) {
    test(`${account.role} lands on ${account.home} and sees its own menu`, async ({ page }) => {
      await login(page, account.email);
      await expect(page).toHaveURL(new RegExp(`${account.home}$`));

      const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
      const first = NAV[account.role][0];
      expect(first).toBeDefined();
      await expect(sidebar.getByRole('link', { name: first!.label })).toBeVisible();
      await expect(sidebar.getByRole('link')).toHaveCount(NAV[account.role].length);
    });
  }

  test('a wrong password shows a clear error and stays on the login page', async ({ page }) => {
    // One bad attempt only, on an account used once elsewhere, to stay under the limiter.
    await login(page, 'vendedor@demo.ladorada.co', `${DEMO_PASSWORD}x`);
    await expect(page.getByText('Correo o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
