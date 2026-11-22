import { expect, test } from '@playwright/test';

// Needs no Supabase stack: a signed-out visit never calls the API.
test('signed-out visitors land on the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Drum Practice Pal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a sign-in link' })).toBeVisible();
});
