const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ============= SALUD DEL SERVIDOR =============
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'tienda-ecommerce' });
});

// ============= CATEGORÍAS =============
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.get('/api/categories/:id', (req, res) => {
  db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!row) res.status(404).json({ error: 'Categoría no encontrada' });
    else res.json(row);
  });
});

// ============= PRODUCTOS =============
app.get('/api/products', (req, res) => {
  const { category_id, search, sort } = req.query;
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category_id) {
    query += ' AND category_id = ?';
    params.push(category_id);
  }

  if (search) {
    query += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (sort === 'price_asc') query += ' ORDER BY price ASC';
  else if (sort === 'price_desc') query += ' ORDER BY price DESC';
  else if (sort === 'newest') query += ' ORDER BY created_at DESC';
  else if (sort === 'rating') query += ' ORDER BY rating DESC';
  else query += ' ORDER BY name ASC';

  db.all(query, params, (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!row) res.status(404).json({ error: 'Producto no encontrado' });
    else res.json(row);
  });
});

// ============= USUARIOS =============
app.post('/api/auth/register', (req, res) => {
  const { email, password, full_name, phone } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, contraseña y nombre requeridos' });
  }

  db.run('INSERT INTO users (email, password, full_name, phone) VALUES (?, ?, ?, ?)',
    [email, password, full_name, phone],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          res.status(400).json({ error: 'El email ya está registrado' });
        } else {
          res.status(400).json({ error: err.message });
        }
      } else {
        res.status(201).json({ id: this.lastID, email, full_name });
      }
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!row) res.status(401).json({ error: 'Email o contraseña inválidos' });
    else res.json({ id: row.id, email: row.email, full_name: row.full_name, is_admin: row.is_admin });
  });
});

app.get('/api/users/:id', (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!row) res.status(404).json({ error: 'Usuario no encontrado' });
    else {
      delete row.password;
      res.json(row);
    }
  });
});

// ============= CARRITO =============
app.post('/api/cart', (req, res) => {
  const { user_id, product_id, quantity } = req.body;

  if (!user_id || !product_id || !quantity) {
    return res.status(400).json({ error: 'user_id, product_id y quantity requeridos' });
  }

  db.run('INSERT OR REPLACE INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
    [user_id, product_id, quantity],
    function(err) {
      if (err) res.status(400).json({ error: err.message });
      else res.status(201).json({ message: 'Producto agregado al carrito' });
    }
  );
});

app.get('/api/cart/:user_id', (req, res) => {
  db.all(`SELECT c.*, p.name, p.price, p.image_url 
          FROM cart c 
          JOIN products p ON c.product_id = p.id 
          WHERE c.user_id = ?`,
    [req.params.user_id],
    (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else {
        const total = rows.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        res.json({ items: rows, total: total.toFixed(2) });
      }
    }
  );
});

app.delete('/api/cart/:user_id/:product_id', (req, res) => {
  db.run('DELETE FROM cart WHERE user_id = ? AND product_id = ?',
    [req.params.user_id, req.params.product_id],
    function(err) {
      if (err) res.status(500).json({ error: err.message });
      else res.json({ message: 'Producto removido del carrito' });
    }
  );
});

// ============= ÓRDENES =============
app.post('/api/orders', (req, res) => {
  const { user_id, cart_items, total_amount, payment_method, shipping_address } = req.body;

  if (!user_id || !cart_items || !total_amount) {
    return res.status(400).json({ error: 'Datos incompletos para crear orden' });
  }

  const order_number = 'ORD-' + Date.now();

  db.run('INSERT INTO orders (user_id, order_number, total_amount, payment_method, shipping_address, status) VALUES (?, ?, ?, ?, ?, ?)',
    [user_id, order_number, total_amount, payment_method, shipping_address, 'confirmed'],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });

      const order_id = this.lastID;

      // Insertar items de la orden
      let completed = 0;
      cart_items.forEach(item => {
        db.run('INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [order_id, item.product_id, item.quantity, item.price, item.quantity * item.price],
          (err) => {
            completed++;
            if (completed === cart_items.length) {
              // Limpiar carrito
              db.run('DELETE FROM cart WHERE user_id = ?', [user_id], () => {
                res.status(201).json({ id: order_id, order_number, total_amount, status: 'confirmed' });
              });
            }
          }
        );
      });
    }
  );
});

app.get('/api/orders/:user_id', (req, res) => {
  db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.params.user_id], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.get('/api/orders/:user_id/:order_id', (req, res) => {
  db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.order_id, req.params.user_id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    db.all('SELECT oi.*, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?',
      [req.params.order_id],
      (err, items) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ ...order, items });
      }
    );
  });
});

// ============= RESEÑAS =============
app.post('/api/reviews', (req, res) => {
  const { product_id, user_id, rating, comment } = req.body;

  if (!product_id || !user_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Datos inválidos para reseña' });
  }

  db.run('INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
    [product_id, user_id, rating, comment],
    function(err) {
      if (err) res.status(400).json({ error: err.message });
      else res.status(201).json({ id: this.lastID, product_id, rating });
    }
  );
});

app.get('/api/reviews/:product_id', (req, res) => {
  db.all('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [req.params.product_id], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

// ============= CUPONES =============
app.post('/api/coupons/validate', (req, res) => {
  const { code, purchase_amount } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Código de cupón requerido' });
  }

  db.get('SELECT * FROM coupons WHERE code = ? AND is_active = 1', [code], (err, coupon) => {
    if (err) res.status(500).json({ error: err.message });
    else if (!coupon) res.status(404).json({ error: 'Cupón no válido' });
    else if (purchase_amount && coupon.min_purchase && purchase_amount < coupon.min_purchase) {
      res.status(400).json({ error: `Compra mínima de $${coupon.min_purchase}` });
    }
    else {
      const discount = coupon.discount_percent ? (purchase_amount * coupon.discount_percent / 100) : coupon.discount_amount;
      res.json({ valid: true, discount, discount_percent: coupon.discount_percent });
    }
  });
});

// ============= ESTADÍSTICAS (para testing) =============
app.get('/api/stats', (req, res) => {
  Promise.all([
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM orders', (err, row) => {
        resolve(err ? 0 : row.count);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT SUM(total_amount) as total FROM orders', (err, row) => {
        resolve(err ? 0 : row.total || 0);
      });
    })
  ]).then(([products, users, orders, revenue]) => {
    res.json({ products, users, orders, revenue: parseFloat(revenue).toFixed(2) });
  });
});

// ============= ERROR HANDLING =============
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`\n🏪 Tienda E-commerce ejecutándose en http://localhost:${PORT}`);
  console.log(`📊 API disponible en http://localhost:${PORT}/api\n`);
});

module.exports = app;
