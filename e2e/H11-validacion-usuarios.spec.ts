import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL,
  MIN_PDF,
  SELLER_PASSWORD,
  login,
  registerAndSubmitSeller,
  uniqueSellerEmail,
} from './helpers';

// H11: Back Office validates a seller end to end. One fresh seller per run (independent of H06).
test.describe.configure({ mode: 'serial' });

const NOTES = 'La cédula está borrosa, súbela de nuevo con mejor luz.';

let adminCtx: BrowserContext;
let sellerCtx: BrowserContext;
let admin: Page;
let seller: Page;
let sellerEmail: string;
let detailUrl: string;

async function openSellerDetail(): Promise<void> {
  await admin.goto('/bo/users');
  await admin.getByRole('searchbox', { name: 'Buscar', exact: true }).fill(sellerEmail);
  await admin.getByRole('button', { name: 'Filtrar' }).click();
  await expect(admin).toHaveURL(/q=/);
  await admin
    .getByRole('link', { name: /Revisar de / })
    .first()
    .click();
  await expect(admin).toHaveURL(/\/bo\/users\/[^/?]+$/);
  detailUrl = admin.url();
}

const DOCUMENT_LABELS = [
  'Cédula de ciudadanía',
  'Certificado de Cámara de Comercio',
  'RUT',
] as const;

/** Review actions disable every control while they run; wait for them to settle. */
async function idle(): Promise<void> {
  await expect(admin.getByRole('button', { name: 'Solicitar correcciones' })).toBeEnabled();
}

/** Approves the latest upload of each required document except the ones in `skip`. */
async function approveDocuments(skip: readonly string[] = []): Promise<void> {
  for (const label of DOCUMENT_LABELS) {
    if (skip.includes(label)) continue;
    await idle();
    const btn = admin.getByRole('button', { name: new RegExp(`^Aprobar ${label}`) }).last();
    if (await btn.isEnabled()) await btn.click();
    await idle();
    await expect(btn).toBeDisabled();
  }
}

async function tickAllKyc(): Promise<void> {
  for (const box of await admin.getByRole('checkbox').all()) {
    if (!(await box.isChecked())) await box.check();
  }
}

test.beforeAll(async ({ browser }) => {
  adminCtx = await browser.newContext();
  sellerCtx = await browser.newContext();
  admin = await adminCtx.newPage();
  seller = await sellerCtx.newPage();
  sellerEmail = uniqueSellerEmail('vendedor-h11');
});

test.afterAll(async () => {
  await adminCtx.close();
  await sellerCtx.close();
});

test('a seller submits a fresh registration', async () => {
  test.setTimeout(120_000);
  await registerAndSubmitSeller(seller, sellerEmail, { name: 'Camila Revisión Ficticia' });
});

test('admin finds the seller and opens a document through a short-lived signed link', async () => {
  await login(admin, ADMIN_EMAIL);
  await expect(admin).toHaveURL(/\/bo$/);
  await openSellerDetail();
  await expect(admin.getByRole('heading', { name: 'Camila Revisión Ficticia' })).toBeVisible();

  const links = admin.getByRole('link', { name: /^Ver/ });
  await expect(links).toHaveCount(3);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /^\/api\/verification\/documents\//);
  }

  const href = await links.first().getAttribute('href');
  const res = await admin.request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toContain('X-Amz-Signature');
});

test('admin reviews documents and KYC, then requests corrections', async () => {
  await admin.goto(detailUrl);
  await expect(admin.getByRole('button', { name: 'Aprobar registro' })).toBeDisabled();

  // Reject the national ID, approve the rest, complete the checklist.
  await admin.getByRole('button', { name: /^Rechazar Cédula/ }).click();
  await expect(admin.getByText('Documento rechazado').first()).toBeVisible();
  await idle();
  await approveDocuments(['Cédula de ciudadanía']);
  await admin.getByRole('button', { name: 'Consultar listas restrictivas' }).click();
  await expect(admin.getByText(/Consulta simulada sin coincidencias/)).toBeVisible();
  await tickAllKyc();

  await admin.getByRole('button', { name: 'Solicitar correcciones' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Solicitar correcciones' });
  await dialog.getByLabel('Observaciones').fill(NOTES);
  await dialog.getByRole('button', { name: 'Solicitar correcciones' }).click();
  await expect(admin.getByText('Esperando que la persona corrija')).toBeVisible();
});

test('the seller sees the notes, replaces the document and resubmits', async () => {
  await seller.goto('/onboarding');
  await expect(seller.getByText('El equipo pidió correcciones')).toBeVisible();
  await expect(seller.getByText(NOTES)).toBeVisible();

  await seller.goto('/onboarding?paso=2');
  await seller.getByLabel(/Reemplazar: Cédula/).setInputFiles(MIN_PDF);
  await expect(
    seller.getByText('El Back Office lo revisará cuando envíes tu registro.'),
  ).toBeVisible();

  await seller.goto('/onboarding?paso=6');
  await seller.getByRole('button', { name: 'Reenviar a revisión' }).click();
  await expect(seller.getByText('Tiempo estimado: 1 a 2 días hábiles')).toBeVisible({
    timeout: 20_000,
  });
});

test('admin approves the resubmitted registration', async () => {
  await admin.goto(detailUrl);
  await approveDocuments();
  await tickAllKyc();
  const approve = admin.getByRole('button', { name: 'Aprobar registro' });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(admin.getByText('Registro aprobado').first()).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Bloquear cuenta' })).toBeVisible();
});

test('the approved seller logs in again and lands on /seller; blocking ends the open session', async ({
  browser,
}) => {
  const freshCtx = await browser.newContext();
  try {
    const open = await freshCtx.newPage();
    await login(open, sellerEmail, SELLER_PASSWORD);
    await expect(open).toHaveURL(/\/seller$/, { timeout: 30_000 });
    await expect(open.getByRole('heading', { level: 1, name: /^Hola, Camila/ })).toBeVisible();

    // Admin blocks the account while that session is open.
    await admin.goto(detailUrl);
    await admin.getByRole('button', { name: 'Bloquear cuenta' }).click();
    const dialog = admin.getByRole('dialog', { name: 'Bloquear cuenta' });
    await dialog.getByLabel('Motivo del bloqueo').fill('Prueba E2E de bloqueo de sesión abierta.');
    await dialog.getByRole('button', { name: 'Bloquear cuenta' }).click();
    await expect(admin.getByRole('button', { name: 'Desbloquear cuenta' })).toBeVisible();

    await open.reload();
    await expect(open).toHaveURL(/\/(login|onboarding)/);
    if (/\/onboarding/.test(open.url())) {
      await expect(open.getByRole('heading', { name: 'Tu cuenta está bloqueada' })).toBeVisible();
    }
    await open.goto('/seller');
    await expect(open).not.toHaveURL(/\/seller$/);
  } finally {
    await freshCtx.close();
  }
});
