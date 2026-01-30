const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './db/testing.db';

// Asegurar que la carpeta existe
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al conectar la BD:', err);
  } else {
    console.log('Conectado a SQLite:', DB_PATH);
  }
});

// Serializar para evitar carreras
db.serialize(() => {
  // Tabla de usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de productos (para demostración)
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabla de pruebas ejecutadas
  db.run(`
    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_type TEXT NOT NULL,
      status TEXT NOT NULL,
      duration REAL,
      details TEXT,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Datos iniciales
  db.run(`INSERT OR IGNORE INTO products (name, price, stock) 
          VALUES ('Producto A', 29.99, 100), 
                 ('Producto B', 49.99, 50),
                 ('Producto C', 99.99, 25)`);
});

module.exports = db;
