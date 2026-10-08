import { expect, test } from '@playwright/test';

test('landing page loads', async ({ page }) => {
  test.skip(!process.env.E2E, 'Set E2E=1 with running web+api to enable this suite');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /report a local problem/i })).toBeVisible();
});

test('citizen can log in with demo account', async ({ page }) => {
  test.skip(!process.env.E2E, 'Set E2E=1 with running web+api to enable this suite');
  await page.goto('/login');
  await page.getByLabel('Email').fill('citizen@civicfix.demo');
  await page.getByLabel('Password').fill('CivicFix!demo1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /your complaints/i })).toBeVisible();
});
