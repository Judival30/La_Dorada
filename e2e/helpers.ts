import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const DEMO_PASSWORD = 'LaDorada2026!';
export const SELLER_PASSWORD = 'Cordillera2026';
export const ADMIN_EMAIL = 'admin@demo.ladorada.co';
export const MIN_PDF = path.join(__dirname, 'fixtures', 'min.pdf');

export async function login(page: Page, email: string, password = DEMO_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

/** A unique, fictional seller address per run (the demo domain is the only one allowed). */
export function uniqueSellerEmail(tag = 'vendedor'): string {
  return `${tag}+${Date.now()}@demo.ladorada.co`;
}

async function nextStep(page: Page, expected: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page).toHaveURL(expected, { timeout: 20_000 });
}

/** Signs up a seller with Habeas Data consent; ends on /onboarding. */
export async function registerSeller(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/registro');
  await page
    .getByRole('radio', { name: /Quiero vender o recibir inversión/ })
    .check({ force: true });
  await page.getByLabel('Nombre completo').fill(name);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(SELLER_PASSWORD);
  await page.getByRole('checkbox', { name: /Autorizo a La Dorada/ }).check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
}

/**
 * Registers a seller, completes the 6 wizard steps (national ID, chamber of commerce and
 * RUT as legal representative) and submits. Ends on the "En revisión" view.
 * `beforeIdUpload` runs on step 2 before the cédula is uploaded (for upload-rejection checks).
 */
export async function registerAndSubmitSeller(
  page: Page,
  email: string,
  opts: { name?: string; company?: string; beforeIdUpload?: () => Promise<void> } = {},
): Promise<void> {
  await registerSeller(page, email, opts.name ?? 'Mariana Prueba Ficticia');

  await page.getByLabel('Celular').fill('+57 300 123 4567');
  await page.getByLabel('Cargo en la empresa').fill('Gerente general');
  await nextStep(page, /paso=2/);

  await opts.beforeIdUpload?.();
  await page.getByLabel(/Subir documento: Cédula/).setInputFiles(MIN_PDF);
  await expect(page.getByText('Subido', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();

  await page.getByRole('radio', { name: /Sí, soy el representante legal/ }).check({ force: true });
  await nextStep(page, /paso=4/);

  await page.getByLabel('Razón social').fill(opts.company ?? 'Cafés de Antioquia S.A.S.');
  await page.getByLabel('NIT', { exact: true }).fill('900.555.123-4');
  await page.getByLabel('Sector').selectOption('AGROINDUSTRIA');
  await page.getByLabel('Departamento').selectOption('Antioquia');
  await page.getByLabel('Ciudad').fill('Medellín');
  await nextStep(page, /paso=5/);

  await page.getByLabel(/Subir documento: Certificado/).setInputFiles(MIN_PDF);
  await expect(page.getByText('Subido', { exact: true })).toBeVisible();
  await page.getByLabel(/Subir documento: RUT/).setInputFiles(MIN_PDF);
  await expect(page.getByText('Subido', { exact: true })).toHaveCount(2);

  await page.goto('/onboarding?paso=6');
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByText('Tiempo estimado: 1 a 2 días hábiles')).toBeVisible({
    timeout: 20_000,
  });
}
