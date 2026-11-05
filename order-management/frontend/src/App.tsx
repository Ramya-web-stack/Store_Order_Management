import { useEffect, useState } from "react";
import "./style.css";

const API = "http://localhost:5000";

function App() {
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [customer, setCustomer] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const loadData = async () => {
    const p = await fetch(`${API}/api/products`);
    const o = await fetch(`${API}/api/orders`);
    setProducts(await p.json());
    setOrders(await o.json());
  };

  useEffect(() => {
    loadData();
  }, []);

  const addProduct = async () => {
    if (!name || !sku || !price || !stock) {
      alert("Please enter all product details");
      return;
    }

    const response = await fetch(`${API}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, sku, price: Number(price), stock: Number(stock)
      })
    });

    if (!response.ok) {
      alert("Unable to add product");
      return;
    }

    alert("Product added successfully!");
    setName("");
    setSku("");
    setPrice("");
    setStock("");
    loadData();
  };

  const createOrder = async () => {
    if (!customer || !productId || Number(quantity) <= 0) {
      alert("Enter valid order details");
      return;
    }

    const response = await fetch(`${API}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: customer,
        items: [{
          productId: Number(productId),
          quantity: Number(quantity)
        }]
      })
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.message);
      return;
    }

    alert("Order created successfully!");
    setCustomer("");
    setProductId("");
    setQuantity("1");
    loadData();
  };

  const restock = async (id: number) => {
    const amount = prompt("Enter quantity to add:");

    if (!amount || !Number.isInteger(Number(amount)) || Number(amount) <= 0) {
      return;
    }

    const response = await fetch(`${API}/api/products/${id}/stock`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: Number(amount) })
    });

    if (response.ok) {
      alert("Stock updated!");
      loadData();
    } else {
      alert("Stock update failed");
    }
  };

  const updateStatus = async (id: number, status: string) => {
    const response = await fetch(`${API}/api/orders/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (response.ok) loadData();
    else alert("Status update failed");
  };

  return (
    <div className="app">
      <header>
        <h1>Store Order Management</h1>
        <p>Manage products, inventory and customer orders</p>
      </header>

      <div className="dashboard">
        <div className="card">
          <h3>Total Products</h3>
          <h2>{products.length}</h2>
        </div>
        <div className="card">
          <h3>Total Orders</h3>
          <h2>{orders.length}</h2>
        </div>
        <div className="card">
          <h3>Total Stock</h3>
          <h2>{products.reduce((sum, p) => sum + p.stock, 0)}</h2>
        </div>
      </div>

      <section>
        <h2>Add New Product</h2>
        <div className="form">
          <input placeholder="Product Name" value={name}
            onChange={e => setName(e.target.value)} />
          <input placeholder="SKU" value={sku}
            onChange={e => setSku(e.target.value)} />
          <input type="number" placeholder="Price" value={price}
            onChange={e => setPrice(e.target.value)} />
          <input type="number" placeholder="Stock" value={stock}
            onChange={e => setStock(e.target.value)} />
          <button onClick={addProduct}>Add Product</button>
        </div>
      </section>

      <section>
        <h2>Products & Inventory</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>SKU</th>
              <th>Price</th><th>Stock</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>₹{p.price}</td>
                <td>{p.stock}</td>
                <td><button onClick={() => restock(p.id)}>Restock</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Create Customer Order</h2>
        <div className="form">
          <input placeholder="Customer Name" value={customer}
            onChange={e => setCustomer(e.target.value)} />

          <select value={productId}
            onChange={e => setProductId(e.target.value)}>
            <option value="">Select Product</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} (Stock: {p.stock})
              </option>
            ))}
          </select>

          <input type="number" min="1" placeholder="Quantity"
            value={quantity}
            onChange={e => setQuantity(e.target.value)} />

          <button onClick={createOrder}>Place Order</button>
        </div>
      </section>

      <section>
        <h2>Customer Orders</h2>
        <table>
          <thead>
            <tr>
              <th>Order ID</th><th>Customer</th>
              <th>Total</th><th>Status</th><th>Update Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.customerName}</td>
                <td>₹{o.total}</td>
                <td>{o.status}</td>
                <td>
                  <select value={o.status}
                    onChange={e => updateStatus(o.id, e.target.value)}>
                    {["Pending", "Processing", "Shipped", "Delivered", "Cancelled"].map(s =>
                      <option key={s}>{s}</option>
                    )}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;