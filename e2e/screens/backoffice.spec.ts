import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { login } from '../helpers';

// Visual review + review-flow walkthrough. Run with: SCREENS=1 pnpm e2e e2e/screens/backoffice.spec.ts
// Output goes to test-results/screens/ (git-ignored). Creates one throwaway seller and approves it.
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
    await page.screenshot({ path: `${OUT}/bo-${name}-${s.tag}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function next(page: Page, expected: RegExp) {
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
  await expect(page).toHaveURL(expected, { timeout: 20_000 });
}

test('seller submits, back office reviews and approves', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const email = `e2e-bo-${Date.now()}@demo.ladorada.co`;

  // 1. A throwaway seller completes the case and submits it.
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
  await page.getByLabel('Celular').fill('+57 300 123 4567');
  await page.getByLabel('Cargo en la empresa').fill('Gerente general');
  await next(page, /paso=2/);
  await page.getByLabel(/Subir documento: Cédula/).setInputFiles(PDF);
  await expect(page.getByText('min.pdf')).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();
  await page.getByRole('radio', { name: /Sí, soy el representante legal/ }).check({ force: true });
  await next(page, /paso=4/);
  await page.getByLabel('Razón social').fill('Cafés de Antioquia S.A.S.');
  await page.getByLabel('NIT', { exact: true }).fill('900.123.456-7');
  await page.getByLabel('Sector').selectOption('AGROINDUSTRIA');
  await page.getByLabel('Departamento').selectOption('Antioquia');
  await page.getByLabel('Ciudad').fill('Medellín');
  await next(page, /paso=5/);
  await page.getByLabel(/Subir documento: Certificado/).setInputFiles(PDF);
  await expect(page.getByText('Subido', { exact: true })).toBeVisible();
  await page.getByLabel(/Subir documento: RUT/).setInputFiles(PDF);
  await expect(page.getByText('Subido', { exact: true })).toHaveCount(2);
  await page.goto('/onboarding?paso=6');
  await page.getByRole('button', { name: 'Enviar a revisión' }).click();
  await expect(page.getByText('Tiempo estimado: 1 a 2 días hábiles')).toBeVisible({
    timeout: 20_000,
  });

  // 2. The admin opens the queue and the case.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'admin@demo.ladorada.co');
  await expect(admin).toHaveURL(/\/bo$/);
  await shoot(admin, 'home');

  const nav = admin.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByText('Pronto').first()).toBeVisible();
  await nav.getByRole('link', { name: 'Usuarios' }).click();
  await expect(admin).toHaveURL(/\/bo\/users$/);
  await expect(admin.getByRole('heading', { name: 'Validación de usuarios' })).toBeVisible();
  await shoot(admin, 'queue');

  await admin.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('Cafés de Antioquia');
  await admin.getByRole('button', { name: 'Filtrar' }).click();
  await expect(admin).toHaveURL(/q=/);
  await admin
    .getByRole('link', { name: /Revisar de Mariana Prueba Ficticia/ })
    .first()
    .click();
  await expect(admin.getByRole('heading', { name: 'Mariana Prueba Ficticia' })).toBeVisible();

  // Approve is blocked and says exactly what is missing.
  const approve = admin.getByRole('button', { name: 'Aprobar registro' });
  await expect(approve).toBeDisabled();
  await expect(admin.getByText('Para aprobar falta:')).toBeVisible();
  await shoot(admin, 'detail-pending');

  // Dialog: counter, validation, Esc.
  await admin.getByRole('button', { name: 'Solicitar correcciones' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Solicitar correcciones' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Observaciones').fill('Corto');
  await expect(dialog.getByText('5/1000')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Solicitar correcciones' })).toBeDisabled();
  await dialog.getByLabel('Observaciones').fill('La cédula está borrosa, súbela de nuevo.');
  await shoot(admin, 'dialog');
  await admin.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Review everything, then approve.
  for (const label of ['Cédula de ciudadanía', 'Certificado de Cámara de Comercio', 'RUT']) {
    await admin.getByRole('button', { name: new RegExp(`^Aprobar ${label}`) }).click();
    await expect(admin.getByText('Documento aprobado').first()).toBeVisible();
    await admin.waitForTimeout(400);
  }
  await admin.getByRole('button', { name: 'Consultar listas restrictivas' }).click();
  await expect(admin.getByText(/Consulta simulada sin coincidencias/)).toBeVisible();
  for (const box of await admin.getByRole('checkbox').all()) {
    if (!(await box.isChecked())) {
      await box.check();
      await admin.waitForTimeout(500);
    }
  }
  await expect(approve).toBeEnabled();
  await shoot(admin, 'detail-ready');
  await approve.click();
  await expect(admin.getByText('Registro aprobado').first()).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Bloquear cuenta' })).toBeVisible();
  await shoot(admin, 'detail-approved');

  await admin.goto('/bo');
  await shoot(admin, 'home-after');
  await adminCtx.close();
});
