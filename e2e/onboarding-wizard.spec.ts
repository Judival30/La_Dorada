import path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('a new seller fills step 1 and uploads the national ID', async ({ page }) => {
  const email = `e2e-wizard-${Date.now()}@demo.ladorada.co`;

  await page.goto('/registro');
  await page
    .getByRole('radio', { name: /Quiero vender o recibir inversión/ })
    .check({ force: true });
  await page.getByLabel('Nombre completo').fill('Mariana Prueba Ficticia');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('Cordillera2026');
  await page.getByRole('checkbox', { name: /Autorizo a La Dorada/ }).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });

  // Step 1 is the first incomplete step; the stepper marks it as current.
  await expect(page.getByRole('heading', { level: 2, name: 'Tu perfil personal' })).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toContainText('Tu perfil personal');

  // Server-side validation shows per-field messages.
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page.getByText('Escribe tu celular.')).toBeVisible();

  await page.getByLabel('Celular').fill('+57 300 123 4567');
  await page.getByLabel('Cargo en la empresa').fill('Gerente general');
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();

  // Saved: moves to step 2 (identity).
  await expect(page).toHaveURL(/paso=2/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Verificación de identidad' }),
  ).toBeVisible();

  // Client-side validation rejects a wrong type before any request.
  await page.getByLabel(/Subir documento: Cédula/).setInputFiles({
    name: 'nota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hola'),
  });
  await expect(page.getByText('Solo se aceptan archivos PDF, JPG o PNG.')).toBeVisible();

  await page
    .getByLabel(/Subir documento: Cédula/)
    .setInputFiles(path.join(__dirname, 'fixtures', 'min.pdf'));
  await expect(page.getByText('min.pdf')).toBeVisible();
  await expect(page.getByText('Subido', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quitar/ })).toBeVisible();

  // Progress reflects steps 1 and 2.
  await expect(page.getByRole('progressbar', { name: 'Progreso del registro' })).toHaveAttribute(
    'aria-valuenow',
    '2',
  );

  // Step 6 lists what is still missing and keeps the submit button disabled.
  await page.goto('/onboarding?paso=6');
  await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled();
});
