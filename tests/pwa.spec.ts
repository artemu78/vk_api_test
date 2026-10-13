import { test, expect } from '@playwright/test';

const path = '/vk_api_test/';
async function prepare(page: import('@playwright/test').Page) {
  await page.goto(path);
  await expect(page.getByText('Готово офлайн: оболочка сохранена', { exact: false })).toBeVisible();
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('subpath assets, installable manifest, offline refresh and reopen', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page);
  const registration = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active?.scriptURL };
  });
  expect(registration.scope).toBe('http://localhost:4173/vk_api_test/');
  expect(registration.script).toBe('http://localhost:4173/vk_api_test/sw.js');
  const manifest = await (await page.request.get(`${path}manifest.webmanifest`)).json();
  expect(manifest.start_url).toBe(path);
  expect(manifest.scope).toBe(path);
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const response = await page.request.get(`${path}${icon.src}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  const eligibility = await cdp.send('Page.getInstallabilityErrors');
  // Playwright contexts are incognito: validate every other installability criterion.
  expect(eligibility.installabilityErrors.filter(error => error.errorId !== 'in-incognito')).toEqual([]);
  await cdp.detach();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'VK API Probe', exact: true })).toBeVisible();
  await expect(page.getByText('приложение работает офлайн', { exact: false })).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(path);
  await expect(reopened.getByRole('button', { name: 'Запустить проверки' })).toBeVisible();
  expect(await reopened.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('VK probes bypass SW caches; reports, history and comparisons persist', async ({ page, context }) => {
  await prepare(page);
  // Playwright aborts URLs ending in /favicon.ico when routing. A harmless
  // query in this test harness avoids that special case without changing the app.
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => original(input === 'https://vk.com/favicon.ico'
      ? `${input}?playwright=1` : input, init);
  });
  let requests = 0;
  await context.route(/https:\/\/.*vk\.com\//, async route => {
    requests++;
    expect(route.request().headers()['cookie']).toBeUndefined();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(route.request().url().includes('utils.getServerTime')
        ? { response: 1791921023 } : { error: { error_code: 15, error_msg: 'Access denied: token required' } }) });
  });
  await page.getByLabel('Метка замера (необязательно)').fill('Wi-Fi normal');
  await page.getByRole('button', { name: 'Запустить проверки' }).click();
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible();
  expect(requests).toBe(7);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON' }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  for (const key of ['timestamp', 'userAgent', 'navigatorOnline', 'connectionInfo', 'appVersion', 'tests']) expect(report).toHaveProperty(key);
  expect(report.tests.filter((t: { status: string }) => t.status === 'opaque')).toHaveLength(5);
  expect(report.tests[3].status).toBe('readable');
  expect(report.tests[3].apiOutcome).toBe('error');
  expect(report.tests[3].apiErrorCode).toBe(15);
  expect(report.tests[4].apiOutcome).toBe('success');
  await page.getByLabel('Метка замера (необязательно)').fill('Mobile restricted');
  await page.getByRole('button', { name: 'Запустить проверки' }).click();
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible();
  expect(requests).toBe(14);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key =>
    (await (await caches.open(key)).keys()).map(r => r.url)))).flat());
  expect(cached.every(url => new URL(url).origin === 'http://localhost:4173')).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Последние замеры (2/20)' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await context.unrouteAll();
  // With no connectivity, completed no-cors requests must not come from a cache.
  await page.getByRole('button', { name: 'Запустить проверки' }).click();
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible();
  const latest = await page.evaluate(() => JSON.parse(localStorage.getItem('vk-probe-runs-v1')!)[0]);
  expect(latest.tests.every((t: { status: string }) => t.status === 'failed')).toBe(true);
  await expect(page.locator('tr.changed')).toHaveCount(7);
});

test('readable HTTP errors, API success and timeout remain distinct', async ({ page, context }) => {
  await prepare(page);
  await context.route(/https:\/\/.*vk\.com\//, route => route.fulfill({ status: 200, body: '' }));
  await context.route('https://api.vk.com/method/**', route => route.fulfill({ status: 503,
    headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Запустить проверки' }).click();
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible();
  let result = await page.evaluate(() => JSON.parse(localStorage.getItem('vk-probe-runs-v1')!)[0].tests[3]);
  expect(result.status).toBe('http-error'); expect(result.httpStatus).toBe(503);
  await context.unroute('https://api.vk.com/method/**');
  await context.route('https://api.vk.com/method/**', route => route.fulfill({ status: 200,
    headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"response":[]}' }));
  await page.getByRole('button', { name: 'Запустить проверки' }).click();
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible();
  result = await page.evaluate(() => JSON.parse(localStorage.getItem('vk-probe-runs-v1')!)[0].tests[3]);
  expect(result.apiOutcome).toBe('success');
  await context.unroute('https://api.vk.com/method/**');
  await context.route('https://api.vk.com/method/users.get?**', () => { /* Simulate a stalled network request. */ });
  await page.getByRole('button', { name: 'Запустить проверки' }).click();
  await expect(page.getByRole('button', { name: 'Экспорт JSON' })).toBeVisible({ timeout: 15000 });
  result = await page.evaluate(() => JSON.parse(localStorage.getItem('vk-probe-runs-v1')!)[0].tests[3]);
  expect(result.status).toBe('timeout'); expect(result.ms).toBeGreaterThanOrEqual(8900);
});
