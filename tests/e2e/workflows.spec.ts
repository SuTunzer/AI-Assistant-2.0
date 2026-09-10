import { test, expect } from '@playwright/test';
test('task actions, reviewed memory, temporary capture and an offline episode', async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build a briefing' }).first()).toBeVisible();
  await expect(page.getByText('Nothing is sent to a server.', { exact: false })).toBeVisible();
  await page.screenshot({
    path: 'test-results/' + info.project.name + '-today.png',
    fullPage: true,
  });
  // Reordering is the priority order and lands immediately — nudge the top
  // task down and it swaps with the one below without a reload.
  const topTitle = (await page.locator('.task-body > span').first().textContent())!.trim();
  await page.getByRole('button', { name: `Move ${topTitle} down`, exact: true }).click();
  await expect(page.locator('.task-body > span').nth(1)).toHaveText(topTitle);
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Task', exact: true })
    .fill('Send the small first draft');
  await page.getByRole('dialog').getByRole('button', { name: 'Add task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Make time for a quiet walk');
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Details', exact: true })
    .fill('A quiet walk helps me find perspective.');
  await page.getByRole('button', { name: 'Save memory', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make time for a quiet walk' })).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Make time for a quiet walk A quiet walk helps me find perspective.',
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Details', exact: true })
    .fill('A ten minute walk helps me find perspective.');
  // Linking used to be one-way: a native multi-select could only add. A tick
  // must come back off again, by tap as well as by click.
  await page.getByRole('dialog').getByText('Connect to people, memories and tasks').click();
  const link = page.getByRole('dialog').getByRole('checkbox', { name: 'Run three times a week' });
  await link.check();
  await expect(link).toBeChecked();
  await link.uncheck();
  await expect(link).not.toBeChecked();
  await page.screenshot({
    path: 'test-results/' + info.project.name + '-memory-links.png',
  });
  await page.getByRole('button', { name: 'Save & mark reviewed' }).click();
  await expect(
    page.getByText('A ten minute walk helps me find perspective.', { exact: true }),
  ).toBeVisible();
  await page.goto('/#/capture');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('checkbox', { name: "Temporary (don't save)" }).check();
  await page
    .getByRole('textbox', { name: 'Your note' })
    .fill('A temporary worry that should not become a memory.');
  await page.getByRole('button', { name: 'Send', exact: true }).last().click();
  await expect(page.getByText('This temporary note has not been added to memory.')).toBeVisible();
  await page.goto('/#/memory');
  await page.getByRole('textbox', { name: 'Search memories' }).fill('temporary worry');
  await expect(page.getByText('No memories match this search.')).toBeVisible();
  await page.goto('/#/listen');
  await page.getByRole('button', { name: 'Try a sample briefing' }).click();
  await expect(page.getByRole('heading', { name: 'Daily briefing', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Download Daily briefing', exact: true }).click();
  await expect(page.getByText('Downloaded for offline playback.')).toBeVisible();
  await page.getByRole('button', { name: 'Play Daily briefing', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Build a briefing.' })).toBeVisible();
  await page.getByRole('button', { name: 'Play Daily briefing', exact: true }).click();
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
    if (route === 'memory')
      await page.screenshot({
        path: 'test-results/' + info.project.name + '-memory.png',
        fullPage: true,
      });
    if (route === 'settings') {
      await page.getByLabel('Name', { exact: true }).fill('Alex');
      await page.getByRole('button', { name: 'Save preferences', exact: true }).first().click();
      await expect(page.getByText('Settings saved.')).toBeVisible();
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
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recording.' })).toBeVisible();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paused.' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.goto('/#/today');
  await page.goto('/#/capture');
  await expect(page.getByText('Unsent recording', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByText('Unsent recording', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
