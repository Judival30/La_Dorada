import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('sign-up', () => {
  test('login links to the sign-up page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Crea una' }).click();
    await expect(page).toHaveURL(/\/registro$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Crea tu cuenta' })).toBeVisible();
  });

  test('validation errors show next to each field without creating the account', async ({
    page,
  }) => {
    await page.goto('/registro');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByText('Elige cómo quieres usar La Dorada.')).toBeVisible();
    await expect(page.getByText(/debes autorizar el tratamiento/)).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test('a new seller signs up with the keyboard and lands on /onboarding as pending', async ({
    page,
  }) => {
    const email = `e2e-registro-${Date.now()}@demo.ladorada.co`;
    await page.goto('/registro');

    // Role cards are native radios: keyboard selection works.
    await page.getByRole('radio', { name: /Quiero invertir o comprar/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('radio', { name: /Quiero vender o recibir inversión/ }),
    ).toBeChecked();

    await page.getByLabel('Nombre completo').fill('Mariana Prueba Ficticia');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill('Cordillera2026');
    await expect(page.getByText('Al menos un número: cumplido')).toBeAttached();
    await page.getByRole('checkbox', { name: /Autorizo a La Dorada/ }).check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByText('Registro pendiente')).toBeVisible();

    // Signed in: /registro now sends the user back to onboarding.
    await page.goto('/registro');
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
