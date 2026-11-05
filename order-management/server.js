const express = require("express");
const cors = require("cors");
const { DatabaseSync } = require("node:sqlite");

const app = express();

app.use(cors());
app.use(express.json());

// SQLite Database
const db = new DatabaseSync("store.db");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerName TEXT NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'Pending',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Home API
app.get("/", (req, res) => {
    res.send("Order Management API is running!");
});

// Get Products
app.get("/api/products", (req, res) => {
    res.json(db.prepare("SELECT * FROM products").all());
});

// Add Product
app.post("/api/products", (req, res) => {
    try {
        const { name, sku, price, stock } = req.body;

        if (!name || !sku || !Number.isFinite(Number(price)) ||
            Number(price) < 0 || !Number.isInteger(Number(stock)) ||
            Number(stock) < 0) {
            return res.status(400).json({ message: "Invalid product details" });
        }

        const result = db.prepare(
            "INSERT INTO products (name, sku, price, stock) VALUES (?, ?, ?, ?)"
        ).run(name, sku, Number(price), Number(stock));

        res.status(201).json({
            id: Number(result.lastInsertRowid),
            name, sku,
            price: Number(price),
            stock: Number(stock)
        });
    } catch (error) {
        res.status(400).json({ message: "Product could not be added. Check SKU." });
    }
});

// Restock Product
app.put("/api/products/:id/stock", (req, res) => {
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({ message: "Invalid quantity" });
    }

    const result = db.prepare(
        "UPDATE products SET stock = stock + ? WHERE id = ?"
    ).run(quantity, Number(req.params.id));

    if (Number(result.changes) === 0) {
        return res.status(404).json({ message: "Product not found" });
    }

    const product = db.prepare(
        "SELECT * FROM products WHERE id = ?"
    ).get(Number(req.params.id));

    res.json({ message: "Stock updated successfully", product });
});

// Create Order
app.post("/api/orders", (req, res) => {
    const { customerName, items } = req.body;

    if (!customerName || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Invalid order details" });
    }

    try {
        db.exec("BEGIN");

        let total = 0;
        const orderItems = [];

        for (const item of items) {
            const quantity = Number(item.quantity);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new Error("Invalid quantity");
            }

            const product = db.prepare(
                "SELECT * FROM products WHERE id = ?"
            ).get(Number(item.productId));

            if (!product) throw new Error("Product not found");
            if (product.stock < quantity) throw new Error("Insufficient stock");

            db.prepare(
                "UPDATE products SET stock = stock - ? WHERE id = ?"
            ).run(quantity, product.id);

            total += product.price * quantity;

            orderItems.push({
                productId: product.id,
                name: product.name,
                quantity,
                price: product.price
            });
        }

        const result = db.prepare(`
            INSERT INTO orders (customerName, items, total)
            VALUES (?, ?, ?)
        `).run(customerName, JSON.stringify(orderItems), total);

        db.exec("COMMIT");

        res.status(201).json({
            id: Number(result.lastInsertRowid),
            customerName,
            items: orderItems,
            total,
            status: "Pending"
        });

    } catch (error) {
        db.exec("ROLLBACK");
        res.status(400).json({ message: error.message });
    }
});

// Get Orders
app.get("/api/orders", (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();

    res.json(orders.map(order => ({
        ...order,
        items: JSON.parse(order.items)
    })));
});

// Update Order Status
app.put("/api/orders/:id/status", (req, res) => {
    const { status } = req.body;

    const allowed = [
        "Pending", "Processing", "Shipped",
        "Delivered", "Cancelled"
    ];

    if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    const result = db.prepare(
        "UPDATE orders SET status = ? WHERE id = ?"
    ).run(status, Number(req.params.id));

    if (Number(result.changes) === 0) {
        return res.status(404).json({ message: "Order not found" });
    }

    res.json(
        db.prepare("SELECT * FROM orders WHERE id = ?")
            .get(Number(req.params.id))
    );
});

// Start Server
const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("SQLite database connected successfully!");
});