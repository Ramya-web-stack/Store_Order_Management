import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { z } from 'zod';

export function createApp(db: Database.Database) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/products', (_req, res) => {
    res.json(db.prepare('SELECT id, name, price, stock FROM products ORDER BY id DESC').all());
  });

  app.post('/api/products', (req, res) => {
    const parsed = z.object({ name: z.string().trim().min(1), price: z.number().positive(), stock: z.number().int().min(0) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Name, positive price and non-negative integer stock are required.' });
    try {
      const result = db.prepare('INSERT INTO products(name, price, stock) VALUES (?, ?, ?)').run(parsed.data.name, parsed.data.price, parsed.data.stock);
      return res.status(201).json(db.prepare('SELECT id, name, price, stock FROM products WHERE id=?').get(result.lastInsertRowid));
    } catch { return res.status(409).json({ error: 'Could not create product.' }); }
  });

  app.post('/api/products/:id/restock', (req, res) => {
    const id = Number(req.params.id);
    const parsed = z.object({ quantity: z.number().int().positive() }).safeParse(req.body);
    if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ error: 'Valid product id and positive integer quantity are required.' });
    const result = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(parsed.data.quantity, id);
    if (!result.changes) return res.status(404).json({ error: 'Product not found.' });
    return res.json(db.prepare('SELECT id, name, price, stock FROM products WHERE id=?').get(id));
  });

  const placeOrder = db.transaction((items: { productId: number; quantity: number }[], key: string) => {
    const existing = db.prepare('SELECT id, status, total_amount AS totalAmount FROM orders WHERE idempotency_key=?').get(key) as any;
    if (existing) return { existing: true, order: existing };
    let total = 0;
    const productRows: any[] = [];
    for (const item of items) {
      const product = db.prepare('SELECT id, name, price, stock FROM products WHERE id=?').get(item.productId) as any;
      if (!product) throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
      if (product.stock < item.quantity) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      productRows.push({ ...item, product });
      total += product.price * item.quantity;
    }
    for (const row of productRows) {
      const update = db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(row.quantity, row.productId, row.quantity);
      if (!update.changes) throw new Error(`INSUFFICIENT_STOCK:${row.product.name}`);
    }
    const result = db.prepare('INSERT INTO orders(idempotency_key,status,total_amount) VALUES (?,\'PLACED\',?)').run(key, total);
    const orderId = Number(result.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)');
    for (const row of productRows) insertItem.run(orderId, row.productId, row.quantity, row.product.price);
    return { existing: false, order: { id: orderId, status: 'PLACED', totalAmount: total } };
  });

  app.post('/api/orders', (req, res) => {
    const key = req.header('Idempotency-Key');
    if (!key || key.length > 200) return res.status(400).json({ error: 'Idempotency-Key header is required (max 200 characters).' });
    const parsed = z.object({ items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100) })).min(1).max(20) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'An order must contain 1–20 products; each quantity must be 1–100.' });
    if (new Set(parsed.data.items.map(i => i.productId)).size !== parsed.data.items.length) return res.status(400).json({ error: 'A product may appear only once in an order.' });
    try {
      const result = placeOrder(parsed.data.items, key);
      return res.status(result.existing ? 200 : 201).json(result.order);
    } catch (error) {
      const message = (error as Error).message;
      if (message.startsWith('PRODUCT_NOT_FOUND:')) return res.status(404).json({ error: `Product ${message.split(':')[1]} was not found.` });
      if (message.startsWith('INSUFFICIENT_STOCK:')) return res.status(409).json({ error: `Insufficient stock for ${message.split(':')[1]}. No items were reserved.` });
      return res.status(500).json({ error: 'Could not place order.' });
    }
  });

  app.get('/api/orders/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid order id.' });
    const order = db.prepare('SELECT id, status, total_amount AS totalAmount, created_at AS createdAt FROM orders WHERE id=?').get(id) as any;
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    order.items = db.prepare(`SELECT oi.product_id AS productId, p.name, oi.quantity, oi.unit_price AS unitPrice FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`).all(id);
    res.json(order);
  });

  const cancelOrder = db.transaction((id: number) => {
    const order = db.prepare('SELECT status FROM orders WHERE id=?').get(id) as any;
    if (!order) return 'NOT_FOUND';
    if (order.status !== 'PLACED') return 'NOT_CANCELLABLE';
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id=?').all(id) as any[];
    for (const item of items) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity, item.product_id);
    db.prepare("UPDATE orders SET status='CANCELLED' WHERE id=?").run(id);
    return 'CANCELLED';
  });
  app.post('/api/orders/:id/cancel', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid order id.' });
    const result = cancelOrder(id);
    if (result === 'NOT_FOUND') return res.status(404).json({ error: 'Order not found.' });
    if (result === 'NOT_CANCELLABLE') return res.status(409).json({ error: 'Only placed orders can be cancelled.' });
    res.json({ id, status: 'CANCELLED' });
  });

  app.post('/api/orders/:id/ship', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid order id.' });
    const result = db.prepare("UPDATE orders SET status='SHIPPED' WHERE id=? AND status='PLACED'").run(id);
    if (!result.changes) {
      const exists = db.prepare('SELECT id FROM orders WHERE id=?').get(id);
      return exists ? res.status(409).json({ error: 'Only placed orders can be shipped.' }) : res.status(404).json({ error: 'Order not found.' });
    }
    res.json({ id, status: 'SHIPPED' });
  });
  return app;
}
