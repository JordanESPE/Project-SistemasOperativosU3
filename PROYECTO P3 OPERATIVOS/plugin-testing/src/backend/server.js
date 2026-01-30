const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ============= RUTAS API =============

// USUARIOS
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ error: 'Nombre y email requeridos' });
  }

  db.run('INSERT INTO users (name, email) VALUES (?, ?)', 
    [name, email], 
    function(err) {
      if (err) {
        res.status(400).json({ error: err.message });
      } else {
        res.json({ id: this.lastID, name, email });
      }
    }
  );
});

app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Usuario no encontrado' });
    } else {
      res.json(row);
    }
  });
});

// PRODUCTOS
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});

app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (!row) {
      res.status(404).json({ error: 'Producto no encontrado' });
    } else {
      res.json(row);
    }
  });
});

app.post('/api/products/buy/:id', (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity < 1) {
    return res.status(400).json({ error: 'Cantidad inválida' });
  }

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err || !product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Stock insuficiente' });
    }

    db.run(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [quantity, id],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ message: 'Compra exitosa', stockRemaining: product.stock - quantity });
        }
      }
    );
  });
});

// PRUEBAS DE SALUD
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});

module.exports = app;
