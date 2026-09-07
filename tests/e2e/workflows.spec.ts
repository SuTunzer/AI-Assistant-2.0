import { test, expect } from '@playwright/test';
test('task actions, reviewed memory, temporary capture and an offline episode', async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make room for what matters.' })).toBeVisible();
  await expect(
    page.getByText('You are exploring an example life.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + info.project.name + '-today.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'What would you like to do?' })
    .fill('Send the small first draft');
  await page.getByRole('button', { name: 'Review task', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Confirm your new task');
  await page.getByRole('button', { name: 'Confirm and add task' }).click();
  await expect(
    page.getByRole('button', { name: 'Complete Send the small first draft', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Complete Send the small first draft', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Complete Send the small first draft', exact: true }),
  ).toHaveCount(0);
  await page.goto('/#/memory');
  await page.getByRole('button', { name: 'Add a memory' }).click();
  await page.getByLabel('A short title').fill('Make time for a quiet walk');
  await page
    .getByLabel('What should be understood?')
    .fill('A quiet walk helps me find perspective.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make time for a quiet walk' })).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Make time for a quiet walk A quiet walk helps me find perspective.',
    })
    .click();
  await page
    .getByLabel('What should be understood?')
    .fill('A ten minute walk helps me find perspective.');
  await page.getByRole('button', { name: 'Save & mark reviewed' }).click();
  await expect(
    page.getByText('A ten minute walk helps me find perspective.', { exact: true }),
  ).toBeVisible();
  await page.goto('/#/capture');
  await page.getByRole('button', { name: 'Write it down' }).click();
  await page.getByRole('checkbox', { name: 'Talk without remembering' }).check();
  await page
    .getByRole('textbox', { name: 'What is on your mind?' })
    .fill('A temporary worry that should not become a memory.');
  await page.getByRole('button', { name: 'Talk it through', exact: true }).last().click();
  await expect(page.getByText('This temporary note has not been added to memory.')).toBeVisible();
  await page.goto('/#/memory');
  await page.getByRole('textbox', { name: 'Search memories' }).fill('temporary worry');
  await expect(page.getByText('No memories match this search.')).toBeVisible();
  await page.goto('/#/listen');
  await page.getByRole('button', { name: 'Try a sample briefing' }).click();
  await expect(
    page.getByRole('heading', { name: 'A little clarity for today', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Download A little clarity for today', exact: true })
    .click();
  await expect(page.getByText('Downloaded. Ready to listen without a connection.')).toBeVisible();
  await page.getByRole('button', { name: 'Play A little clarity for today', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  await page.screenshot({
    path: 'test-results/' + info.project.name + '-listen.png',
    fullPage: true,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A little clarity. On the go.' })).toBeVisible();
  await page.getByRole('button', { name: 'Play A little clarity for today', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test('all screens fit the viewport and expose working controls', async ({ page }, info) => {
  for (const route of ['today', 'capture', 'listen', 'memory', 'adviser', 'settings']) {
    await page.goto('/#/' + route);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      route + ' overflows',
    ).toBe(true);
    if (route === 'adviser') {
      await page
        .getByRole('textbox', { name: 'Message your adviser' })
        .fill('Help me get started.');
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByText('Sample response', { exact: true })).toBeVisible();
    }
    if (route === 'settings') {
      await page.getByLabel('What should I call you?').fill('Alex');
      await page.getByRole('button', { name: 'Save preferences', exact: true }).first().click();
      await expect(page.getByText('Your preferences are saved.')).toBeVisible();
    }
  }
  await page.screenshot({
    path: 'test-results/' + info.project.name + '-settings.png',
    fullPage: true,
  });
});
test('recovers a microphone recording after leaving the capture screen', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/capture');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You have the floor.' })).toBeVisible();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Take your time.' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.goto('/#/today');
  await page.goto('/#/capture');
  await expect(page.getByText('Unsent recording', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByText('Unsent recording', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
