import { expect, test } from '@playwright/test';
import { registerAndSubmitSeller, uniqueSellerEmail } from './helpers';

// H06: a seller signs up with consent, completes the wizard and ends up "En revisión".
test('H06: a new seller signs up, uploads the documents and submits for review', async ({
  page,
}) => {
  test.setTimeout(120_000);

  await registerAndSubmitSeller(page, uniqueSellerEmail(), {
    beforeIdUpload: async () => {
      // A Windows executable renamed to .pdf passes the client pre-check (name and MIME) but
      // the server sniffs the real bytes and rejects it.
      const fakeExe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256, 0x90)]);
      const resp = page.waitForResponse(
        (r) => r.url().includes('/api/verification/documents') && r.request().method() === 'POST',
      );
      await page.getByLabel(/Subir documento: Cédula/).setInputFiles({
        name: 'x.pdf',
        mimeType: 'application/pdf',
        buffer: fakeExe,
      });
      expect((await resp).status()).toBe(422);
      await expect(page.locator('main').getByRole('alert')).toContainText(
        'Solo se aceptan archivos PDF, JPG o PNG.',
      );
      await expect(page.getByText('Subido', { exact: true })).toHaveCount(0);
    },
  });

  await expect(
    page.getByRole('heading', { level: 1, name: 'Estamos revisando tu registro' }),
  ).toBeVisible();

  // While in review the applicant cannot reach the seller area.
  await page.goto('/seller');
  await expect(page).toHaveURL(/\/onboarding$/);
});
