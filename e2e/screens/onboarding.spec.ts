import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

// Visual review helper. Run with: SCREENS=1 pnpm e2e e2e/screens/onboarding.spec.ts
// Output goes to test-results/screens/ (git-ignored). Creates one throwaway e2e user.
test.skip(!process.env.SCREENS, 'Set SCREENS=1 to capture review screenshots');

const OUT = 'test-results/screens';
const PDF = path.join(__dirname, '..', 'fixtures', 'min.pdf');
const SIZES = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '390', width: 390, height: 844 },
] as const;

async function shoot(page: Page, name: string) {
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/onboarding-${name}-${s.tag}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function next(page: Page, expected: RegExp) {
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page).toHaveURL(expected, { timeout: 20_000 });
}

test('capture the wizard states', async ({ page }) => {
  test.setTimeout(180_000);
  const email = `e2e-shots-${Date.now()}@demo.ladorada.co`;

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

  await shoot(page, '1-step1-empty');

  await page.getByLabel('Celular').fill('+57 300 123 4567');
  await page.getByLabel('Cargo en la empresa').fill('Gerente general');
  await next(page, /paso=2/);
  await page.getByLabel(/Subir documento: Cédula/).setInputFiles(PDF);
  await expect(page.getByText('min.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/paso=3/);
  await page.getByRole('radio', { name: /Sí, soy el representante legal/ }).check({ force: true });
  await next(page, /paso=4/);
  await shoot(page, '2-step4-empty');
  await page.getByLabel('Razón social').fill('Cafés de Antioquia S.A.S.');
  await page.getByLabel('NIT', { exact: true }).fill('900.123.456-7');
  await page.getByLabel('Sector').selectOption('AGROINDUSTRIA');
  await page.getByLabel('Departamento').selectOption('Antioquia');
  await page.getByLabel('Ciudad').fill('Medellín');
  await next(page, /paso=5/);

  await page.getByLabel(/Subir documento: Certificado/).setInputFiles(PDF);
  await expect(page.getByText('Subido', { exact: true })).toBeVisible();
  await shoot(page, '3-step5-one-doc');

  await page.goto('/onboarding?paso=6');
  await shoot(page, '4-step6-incomplete');

  await page.goto('/onboarding?paso=5');
  await page.getByLabel(/Subir documento: RUT/).setInputFiles(PDF);
  await expect(page.getByText('Subido', { exact: true })).toHaveCount(2);
  await page.goto('/onboarding?paso=6');
  await shoot(page, '5-step6-ready');

  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByText('Tiempo estimado: 1 a 2 días hábiles')).toBeVisible({
    timeout: 20_000,
  });
  await shoot(page, '6-in-review');

  // Own throwaway user only: put it in the corrections state as the Back Office would.
  const prisma = new PrismaClient({
    datasourceUrl: 'postgresql://ladorada:ladorada@localhost:5432/ladorada',
  });
  try {
    await prisma.$executeRaw`UPDATE "User" SET status = 'CORRECTIONS_REQUESTED' WHERE email = ${email}`;
    await prisma.$executeRaw`UPDATE "VerificationCase" SET status = 'CORRECTIONS_REQUESTED', "correctionNotes" = ${'La cédula está borrosa: sube una foto más nítida.\nEl RUT debe estar actualizado a este año.'} WHERE "userId" = (SELECT id FROM "User" WHERE email = ${email})`;
    await prisma.$executeRaw`UPDATE "VerificationDocument" SET "reviewStatus" = 'REJECTED' WHERE type = 'NATIONAL_ID' AND "verificationCaseId" IN (SELECT vc.id FROM "VerificationCase" vc JOIN "User" u ON u.id = vc."userId" WHERE u.email = ${email})`;
  } finally {
    await prisma.$disconnect();
  }
  await page.goto('/onboarding?paso=2');
  await shoot(page, '7-corrections-step2');
  await page.goto('/onboarding?paso=6');
  await shoot(page, '8-corrections-step6');
});
