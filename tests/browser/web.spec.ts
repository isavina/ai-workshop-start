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

test('a filter: only the matches, marked; N of M skills; kept in the address', async ({ page }) => {
  await page.goto('/?repository=fixture');
  await page.keyboard.press('/');
  await expect(page.getByLabel('Filter skills')).toBeFocused();
  await page.keyboard.type('use before');
  await expect(page.getByRole('status')).toHaveText('fixture · 2 of 5 skills');
  await expect(page.locator('#skills .name')).toHaveText(['build', 'code-style']);
  await expect(page).toHaveURL(/[?&]q=use\+before/);
  await page.reload();
  await expect(page.getByLabel('Filter skills')).toHaveValue('use before');
  await expect(page.locator('#skills .name')).toHaveText(['build', 'code-style']);
  await expect(page).toHaveScreenshot('filtered.png');
  await page.getByLabel('Filter skills').fill('deploy');
  await expect(page.locator('#skills')).toHaveText('No skill matches "deploy"');
  await page.getByLabel('Filter skills').press('Escape');
  await expect(page.getByRole('status')).toHaveText('fixture · 5 skills');
});

test('a long input, 1,500 emoji: the CLI message, in the error colour; reloaded, the field and the message', async ({ page }) => {
  const input = '😀'.repeat(1500);
  const message = `Not a GitHub URL or a readable directory: ${input}`;
  await page.goto('/');
  await scan(page, input);
  await expect(page.getByRole('status')).toHaveText(message);
  await expect(page.getByRole('status')).toHaveClass('error');
  await page.reload();
  await expect(page.getByLabel('Repository')).toHaveValue(input);
  await expect(page.getByRole('status')).toHaveText(message);
  await expect(page.getByRole('status')).toHaveClass('error');
});

test('an input too long for an address: a message, in the error colour; reloaded, the field and the message', async ({ page }) => {
  const input = 'x'.repeat(1024 * 1024);
  await page.goto('/');
  await page.getByLabel('Repository').fill(input);
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.getByRole('status')).toHaveText('Too long to be a repository: paste a GitHub URL or a directory');
  await expect(page.getByRole('status')).toHaveClass('error');
  await page.reload();
  await expect(page.getByLabel('Repository')).toHaveValue(input);
  await expect(page.getByRole('status')).toHaveText('Too long to be a repository: paste a GitHub URL or a directory');
});
