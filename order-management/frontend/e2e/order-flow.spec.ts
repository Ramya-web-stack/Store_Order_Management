import { test, expect } from '@playwright/test';

test('customer places and tracks an order against the real API', async ({ page, request }) => {
  const unique = `E2E Product ${Date.now()}`;
  const created = await request.post('http://localhost:4000/api/products', { data: { name: unique, price: 12.5, stock: 4 } });
  expect(created.ok()).toBeTruthy();
  await page.goto('/');
  const card = page.locator('.product').filter({ hasText: unique });
  await expect(card).toBeVisible();
  await card.getByLabel(`Order quantity ${unique}`).fill('2');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('status')).toContainText('placed successfully');
  const orderId = await page.locator('input[aria-label="Order ID"]').inputValue();
  await page.getByRole('button', { name: 'Track order' }).click();
  await expect(page.locator('.order')).toContainText(`Order #${orderId}`);
  await expect(page.locator('.order')).toContainText('PLACED');
});
