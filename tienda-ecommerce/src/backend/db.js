const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './db/tienda.db';

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al conectar la BD:', err);
  } else {
    console.log('✅ Conectado a SQLite:', DB_PATH);
  }
});

db.serialize(() => {
  // Tabla de categorías
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de productos
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      sku TEXT UNIQUE,
      image_url TEXT,
      rating REAL DEFAULT 5.0,
      reviews_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // Tabla de usuarios/clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      city TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'Colombia',
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de órdenes
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_number TEXT UNIQUE NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT,
      shipping_address TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Tabla de items en órdenes
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Tabla de carrito
  db.run(`
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(user_id, product_id)
    )
  `);

  // Tabla de reseñas
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Tabla de cupones/descuentos
  db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_percent REAL NOT NULL,
      discount_amount REAL,
      min_purchase REAL DEFAULT 0,
      max_uses INTEGER,
      current_uses INTEGER DEFAULT 0,
      valid_from DATETIME,
      valid_until DATETIME,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insertar categorías iniciales
  db.run(`INSERT OR IGNORE INTO categories (name, description, icon) 
          VALUES 
          ('Electrónica', 'Dispositivos electrónicos', '📱'),
          ('Ropa', 'Prendas de vestir', '👕'),
          ('Libros', 'Libros y material de lectura', '📚'),
          ('Hogar', 'Artículos para el hogar', '🏠'),
          ('Deportes', 'Artículos deportivos', '⚽')`);

  // Insertar productos iniciales
  db.run(`INSERT OR IGNORE INTO products (category_id, name, description, price, stock, sku) 
          VALUES 
          (1, 'iPhone 14', 'Último modelo de Apple', 999.99, 50, 'IP14-001'),
          (1, 'Samsung Galaxy S23', 'Teléfono Android premium', 899.99, 40, 'SGX-023'),
          (2, 'Camiseta Nike', 'Camiseta deportiva', 39.99, 100, 'NK-TSH-001'),
          (2, 'Pantalón Adidas', 'Pantalón deportivo', 59.99, 80, 'AD-PNT-001'),
          (3, 'El Quijote', 'Novela clásica', 24.99, 30, 'QUJ-001'),
          (3, 'Harry Potter', 'Saga de fantasía', 19.99, 50, 'HP-001'),
          (4, 'Lámpara LED', 'Iluminación inteligente', 49.99, 60, 'LED-LMP-001'),
          (5, 'Balón de fútbol', 'Balón profesional', 34.99, 75, 'BAL-001')`);

  // Insertar usuario de prueba
  db.run(`INSERT OR IGNORE INTO users (email, password, full_name, phone, address, city, is_admin) 
          VALUES 
          ('admin@tienda.com', 'admin123', 'Administrador', '1234567890', 'Calle Admin 123', 'Bogotá', 1),
          ('cliente@tienda.com', 'cliente123', 'Cliente Prueba', '9876543210', 'Calle Cliente 456', 'Medellín', 0)`);
});

module.exports = db;
