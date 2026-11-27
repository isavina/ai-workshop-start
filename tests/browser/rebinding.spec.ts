// spec/web.md "Answers only its own names": a page on another site, by DNS rebinding, in a real browser.
// attacker.test is a name someone else owns, pointed at this machine, as DNS rebinding does.
import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--host-resolver-rules=MAP attacker.test 127.0.0.1'] } });

test('another Host: no page, and a script on that origin cannot read a scan', async ({ page, baseURL }) => {
  const attacker = `http://attacker.test:${new URL(baseURL!).port}`;
  // The page under that name: refused, no skills.
  const response = await page.goto(`${attacker}/?repository=fixture`);
  expect(response?.status()).toBe(403);
  await expect(page.locator('#skills')).toHaveCount(0);
  await expect(page.locator('body')).toContainText('Skill Atlas answers only http://localhost or http://127.0.0.1');
  // A script on that origin asks for a scan, as the attacker's page would: refused, no SKILL.md.
  const stolen = await page.evaluate(async () => {
    const answer = await fetch('/api/scan?repository=fixture');
    return { status: answer.status, text: await answer.text() };
  });
  expect(stolen.status).toBe(403);
  expect(stolen.text).not.toContain('SKILL.md');
});
