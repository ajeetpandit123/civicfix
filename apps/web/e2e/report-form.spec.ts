import { expect, test } from '@playwright/test';

const OVER_LONG_TITLE =
  'A huge portion of the road has collapsed in Adarsh Nagar, creating a serious safety hazard for pedestrians and ' +
  'vehicles. The damaged section is difficult to pass and could cause accidents or further collapse.';

test('report wizard blocks an over-long problem line before submit', async ({ page }) => {
  test.skip(!process.env.E2E, 'Set E2E=1 with running web+api to enable this suite');

  await page.goto('/login');
  await page.getByLabel('Email').fill('citizen@civicfix.demo');
  await page.getByLabel('Password').fill('CivicFix!demo1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Cold production server: the first route chunk can take a few seconds to load,
  // so give the post-login navigation a realistic budget.
  await expect(page.getByRole('heading', { name: /your complaints/i })).toBeVisible({ timeout: 15000 });

  await page.goto('/complaints/new');
  await expect(page.getByRole('heading', { name: /report an issue/i })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const title = page.getByLabel('What problem are you reporting?');

  // Over the 160-character contract limit: the wizard must say so and refuse to
  // advance (previously it let the user reach Review and then fail the submit).
  expect(OVER_LONG_TITLE.length).toBeGreaterThan(160);
  await title.fill(OVER_LONG_TITLE);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await expect(page.getByText(/160 characters or fewer/i)).toBeVisible();

  // A headline inside the limit unlocks the next step.
  await title.fill('Road collapse near dominoz');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});
