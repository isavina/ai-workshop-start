// spec/web.md, seen in a real browser: what the page looks like, compared with the baseline
// screenshots in tests/browser/screenshots/. `npm run test:browser -- --update-snapshots` makes them.
import { expect, test, type Page } from '@playwright/test';

async function scan(page: Page, repository: string) {
  await page.getByLabel('Repository').fill(repository);
  await page.getByRole('button', { name: 'Scan' }).click();
}

test('the bare page: the field, the hint, no skills', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Skill Atlas');
  await expect(page.getByLabel('Repository')).toBeFocused();
  await expect(page.locator('main')).toBeHidden();
  await expect(page).toHaveScreenshot('bare-page.png');
});

test('a directory: the skills, the warnings, the first SKILL.md selected', async ({ page }) => {
  await page.goto('/');
  await scan(page, 'fixture');
  await expect(page.getByRole('status')).toHaveText('fixture · 5 skills');
  await expect(page.locator('#warnings li')).toHaveCount(2);
  await expect(page.locator('#skills .name')).toHaveText(['build', 'code-style', 'commits', 'plain', 'release-checklist']);
  await expect(page.locator('#skill h2')).toHaveText('build');
  await expect(page).toHaveScreenshot('directory.png');
});

test('a skill selected: its SKILL.md, its link, also in; kept in the address', async ({ page }) => {
  await page.goto('/?repository=fixture');
  await page.locator('#skills button', { hasText: 'commits' }).first().click();
  await expect(page.locator('#skill')).toContainText('also in .github/skills/commits/SKILL.md');
  await expect(page).toHaveURL(/skill=\.claude%2Fskills%2Fcommits%2FSKILL\.md/);
  await page.reload();
  await expect(page.locator('#skill h2')).toHaveText('commits');
  await expect(page).toHaveScreenshot('skill-selected.png');
});

test('a GitHub repository: its skill, with a link pinned to the commit', async ({ page }) => {
  await page.goto('/');
  await scan(page, 'https://github.com/JetBrains/example');
  await expect(page.getByRole('status')).toHaveText('JetBrains/example · 1 skill');
  await expect(page.locator('#skill a').first()).toHaveAttribute('href', /\/blob\/5ab6270ab772d113e8ad52ebfcaa0109c522ae00\//);
  await expect(page).toHaveScreenshot('github-repository.png');
});

test('an error: the CLI message, on the page', async ({ page }) => {
  await page.goto('/');
  await scan(page, '/nope');
  await expect(page.getByRole('status')).toHaveText('Not a GitHub URL or a readable directory: /nope');
  await expect(page.getByRole('status')).toHaveClass('error');
  await expect(page).toHaveScreenshot('error.png');
});

test('dark mode: the same page in dark colours', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?repository=fixture');
  await expect(page.getByRole('status')).toHaveText('fixture · 5 skills');
  await expect(page).toHaveScreenshot('directory-dark.png');
});
