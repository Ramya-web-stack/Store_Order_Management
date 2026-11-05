import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import request from 'supertest';
import { createApp } from '../src/app.js';

let db: Database.Database;
let api: ReturnType<typeof request>;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,price REAL NOT NULL,stock INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,idempotency_key TEXT NOT NULL UNIQUE,status TEXT NOT NULL,total_amount REAL NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id),product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL,unit_price REAL NOT NULL,UNIQUE(order_id,product_id));`);
  api = request(createApp(db));
});
afterEach(() => db.close());
async function product(stock = 5) {
  const response = await api.post('/api/products').send({ name: 'Keyboard', price: 50, stock });
  return response.body.id as number;
}
describe('order management', () => {
  it('reserves all items and rejects an order atomically if one item is short', async () => {
    const p1 = await product(5); const p2 = await product(0);
    const response = await api.post('/api/orders').set('Idempotency-Key', 'atomic-1').send({ items: [{ productId: p1, quantity: 2 }, { productId: p2, quantity: 1 }] });
    expect(response.status).toBe(409);
    expect((await api.get('/api/products')).body.find((p: any) => p.id === p1).stock).toBe(5);
  });
  it('returns the same order for a retried idempotency key', async () => {
    const id = await product(4); const payload = { items: [{ productId: id, quantity: 1 }] };
    const first = await api.post('/api/orders').set('Idempotency-Key', 'retry-1').send(payload);
    const retry = await api.post('/api/orders').set('Idempotency-Key', 'retry-1').send(payload);
    expect(first.body.id).toBe(retry.body.id);
    expect((await api.get('/api/products')).body[0].stock).toBe(3);
  });
  it('restores stock on cancellation and prevents cancellation after shipping', async () => {
    const id = await product(3);
    const order = await api.post('/api/orders').set('Idempotency-Key', 'cancel-1').send({ items: [{ productId: id, quantity: 2 }] });
    await api.post(`/api/orders/${order.body.id}/cancel`);
    expect((await api.get('/api/products')).body[0].stock).toBe(3);
    const next = await api.post('/api/orders').set('Idempotency-Key', 'ship-1').send({ items: [{ productId: id, quantity: 1 }] });
    await api.post(`/api/orders/${next.body.id}/ship`);
    expect((await api.post(`/api/orders/${next.body.id}/cancel`)).status).toBe(409);
  });
  it('rejects quantities above 100 and more than 20 items', async () => {
    const id = await product(200);
    expect((await api.post('/api/orders').set('Idempotency-Key', 'limit-1').send({ items: [{ productId: id, quantity: 101 }] })).status).toBe(400);
    const items = Array.from({ length: 21 }, (_, i) => ({ productId: i + 1, quantity: 1 }));
    expect((await api.post('/api/orders').set('Idempotency-Key', 'limit-2').send({ items })).status).toBe(400);
  });
});

describe('validation and failure cases', () => {
  it('requires an idempotency key and rejects duplicate products in one order', async () => {
    const id = await product(5);
    const missingKey = await api.post('/api/orders').send({ items: [{ productId: id, quantity: 1 }] });
    expect(missingKey.status).toBe(400);
    const duplicate = await api.post('/api/orders').set('Idempotency-Key', 'duplicate-lines').send({
      items: [{ productId: id, quantity: 1 }, { productId: id, quantity: 1 }]
    });
    expect(duplicate.status).toBe(400);
    expect((await api.get('/api/products')).body[0].stock).toBe(5);
  });

  it('returns not found for an unknown product and leaves inventory unchanged', async () => {
    const id = await product(2);
    const response = await api.post('/api/orders').set('Idempotency-Key', 'missing-product').send({
      items: [{ productId: id, quantity: 1 }, { productId: 99999, quantity: 1 }]
    });
    expect(response.status).toBe(404);
    expect((await api.get('/api/products')).body[0].stock).toBe(2);
  });

  it('restocks an existing product and rejects invalid restock quantities', async () => {
    const id = await product(2);
    const restocked = await api.post(`/api/products/${id}/restock`).send({ quantity: 3 });
    expect(restocked.status).toBe(200);
    expect(restocked.body.stock).toBe(5);
    expect((await api.post(`/api/products/${id}/restock`).send({ quantity: 0 })).status).toBe(400);
    expect((await api.post('/api/products/99999/restock').send({ quantity: 1 })).status).toBe(404);
  });

  it('returns 404 when tracking or cancelling an unknown order', async () => {
    expect((await api.get('/api/orders/99999')).status).toBe(404);
    expect((await api.post('/api/orders/99999/cancel')).status).toBe(404);
  });

  it('rejects a second cancellation without restoring stock twice', async () => {
    const id = await product(5);
    const order = await api.post('/api/orders').set('Idempotency-Key', 'cancel-twice').send({ items: [{ productId: id, quantity: 2 }] });
    expect((await api.post(`/api/orders/${order.body.id}/cancel`)).status).toBe(200);
    expect((await api.post(`/api/orders/${order.body.id}/cancel`)).status).toBe(409);
    expect((await api.get('/api/products')).body[0].stock).toBe(5);
  });
});
