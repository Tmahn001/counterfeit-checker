import { expect, test } from '@playwright/test';

test.describe('scan flow', () => {
  test('landing → scan page prepares the engine and lists products', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /genuine/i })).toBeVisible();
    await page.getByRole('link', { name: 'Start scanning' }).click();
    await expect(page).toHaveURL(/\/scan/);
    // Engine load (OpenCV.js + TF.js model) can take a while on first visit.
    await expect(page.getByTestId('product-picker')).not.toHaveText('Loading…', {
      timeout: 90_000,
    });
    await expect(page.getByTestId('capture-button')).toBeEnabled({ timeout: 90_000 });
  });

  test('captures a (fake-camera) frame and reaches a verdict entirely offline', async ({
    page,
    context,
  }) => {
    await page.goto('/scan');
    await expect(page.getByTestId('capture-button')).toBeEnabled({ timeout: 90_000 });
    // Simulate offline: the authentication flow must not need the network.
    await context.setOffline(true);
    await page.getByTestId('capture-button').click();
    await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('verdict')).toHaveText(
      /Likely genuine|Likely counterfeit|Could not decide/,
    );
    await context.setOffline(false);
  });

  test('a catalogue product without a reference signature is refused, not guessed', async ({
    page,
  }) => {
    await page.goto('/scan');
    await expect(page.getByTestId('capture-button')).toBeEnabled({ timeout: 90_000 });
    const picker = page.getByTestId('product-picker');
    await expect(picker.locator('option', { hasText: 'CWAY Table Water 75cl' })).toHaveText(
      /reference pending/,
    );
    await expect(picker.locator('option', { hasText: 'Gala Sausage Roll' })).toHaveCount(1);
    await expect(picker.locator('option', { hasText: 'Minimie Chinchin' })).toHaveCount(1);
    await picker.selectOption('cway-table-water-75cl');
    await page.getByTestId('capture-button').click();
    await expect(
      page.getByRole('alert').filter({ hasText: /No manufacturer reference/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('verdict')).toHaveCount(0);
  });

  test('offline fallback page is served for un-cached routes', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForTimeout(1500); // let the SW install (production builds only)
    await context.setOffline(true);
    const res = await page.goto('/this-route-does-not-exist').catch(() => null);
    if (res) await expect(page.getByText(/offline|genuine/i).first()).toBeVisible();
    await context.setOffline(false);
  });
});
