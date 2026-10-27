import { expect, test } from '@playwright/test';
import { login } from '../helpers';

// The login limiter is in-memory (5 per IP+email per minute, 20 per email per 15 minutes),
// so each account signs in as few times as possible.
test.describe.configure({ mode: 'serial' });

test.describe('role isolation', () => {
  test('a buyer gets 404 on /bo and /seller, and loses access after logging out', async ({
    page,
  }) => {
    await login(page, 'comprador@demo.ladorada.co');
    await expect(page).toHaveURL(/\/marketplace$/);

    for (const path of ['/bo', '/seller']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }

    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/marketplace');
    await expect(page).toHaveURL(/\/login\?next=%2Fmarketplace$/);
  });

  test('without a session, /marketplace redirects to /login', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page).toHaveURL(/\/login\?next=%2Fmarketplace$/);
  });

  test('a user in review is sent to /onboarding from /marketplace', async ({ page }) => {
    await login(page, 'revision@demo.ladorada.co');
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText('1 a 2 días hábiles')).toBeVisible();

    await page.goto('/marketplace');
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
