#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3002;

// Usar carpeta en home del usuario para datos
const homeDir = os.homedir();
const PLUGIN_DATA_DIR = path.join(homeDir, '.testing-plugin');
const REPORTS_DIR = path.join(PLUGIN_DATA_DIR, 'reports');
const DB_DIR = path.join(PLUGIN_DATA_DIR, 'db');
const DB_FILE = path.join(DB_DIR, 'reports.json');

// Crear directorios si no existen
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// Inicializar base de datos JSON
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));
  }
}

function readDatabase() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

initDatabase();

app.use(express.json({ limit: '50mb' }));
// Servir archivos estáticos desde la carpeta build del proyecto
const buildPath = '/home/jordan/Escritorio/PROYECTO P3 OPERATIVOS/plugin-testing/src/ui/build';
app.use(express.static(buildPath));

// API: Obtener último reporte
app.get('/api/latest-report', (req, res) => {
  const reports = readDatabase();
  if (reports.length === 0) {
    return res.json({ message: 'No reports yet', summary: null, details: [] });
  }
  res.json(reports[reports.length - 1]);
});

// API: Obtener todos los reportes
app.get('/api/reports', (req, res) => {
  const reports = readDatabase();
  res.json(reports.map((r, idx) => ({
    id: idx,
    timestamp: r.timestamp,
    type: r.type || 'COMPLETE_SUITE',
    created_at: r.created_at
  })));
});

// API: Guardar reporte
app.post('/api/reports', (req, res) => {
  const { timestamp, type, data } = req.body;
  const reports = readDatabase();
  const newReport = {
    id: reports.length + 1,
    timestamp: timestamp || new Date().toISOString(),
    type: type || 'COMPLETE_SUITE',
    data: data,
    created_at: new Date().toISOString()
  };
  reports.push(newReport);
  writeDatabase(reports);
  res.json({ id: newReport.id, success: true });
});

// API: Exportar PDF
app.post('/api/export-pdf', (req, res) => {
  try {
    const { PDFDocument } = require('pdfkit');
    const reportData = req.body;

    const doc = new PDFDocument({ margin: 40 });
    const filename = `test-report-${Date.now()}.pdf`;
    const filepath = path.join(REPORTS_DIR, filename);

    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Encabezado
    doc.fontSize(24).font('Helvetica-Bold').text('TEST REPORT', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(new Date().toLocaleString('es-ES'), { align: 'center' });
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Resumen
    doc.fontSize(14).font('Helvetica-Bold').text('SUMMARY');
    doc.moveDown(0.5);

    if (reportData.summary && reportData.summary.tests) {
      doc.fontSize(10).font('Helvetica');
      reportData.summary.tests.forEach(test => {
        doc.text(`${test.type}: ${test.status} (${test.successRate})`);
      });
    }

    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica-Bold').text('OVERALL RESULTS');
    doc.fontSize(10).font('Helvetica');
    if (reportData.summary && reportData.summary.overall) {
      const overall = reportData.summary.overall;
      doc.text(`Total Tests: ${overall.totalTests}`);
      doc.text(`Passed: ${overall.totalPassed}`);
      doc.text(`Failed: ${overall.totalFailed}`);
    }

    doc.end();

    stream.on('finish', () => {
      res.download(filepath, filename, (err) => {
        if (!err) fs.unlinkSync(filepath);
      });
    });

    stream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir index.html para SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/build/index.html'));
});

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/build/index.html'));
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`\n✓ Server running on http://localhost:${PORT}`);
  console.log('✓ Launching browser...\n');
  
  // Iniciar servidor de tienda-ecommerce en paralelo
  console.log('→ Starting e-commerce server...');
  startEcommerceServer();
  
  // Esperar a que ambos servidores estén listos
  setTimeout(() => {
    // Abrir navegador automáticamente (Linux)
    const { exec } = require('child_process');
    const url = `http://localhost:${PORT}`;
    
    exec(`xdg-open "${url}" 2>/dev/null || true`, { shell: '/bin/bash' });
    
    // Ejecutar todas las pruebas automáticamente
    console.log('→ Running tests...\n');
    runTests();
  }, 2000);
});

function startEcommerceServer() {
  const { exec } = require('child_process');
  const ecommerceDir = '/home/jordan/Escritorio/PROYECTO P3 OPERATIVOS/tienda-ecommerce';
  
  // Iniciar el servidor de tienda-ecommerce en background
  exec(`cd "${ecommerceDir}" && npm start`, {
    detached: true,
    stdio: 'pipe'
  });
  
  console.log('✓ E-commerce server started on port 3001');
}

function runTests() {
  // En pkg, __dirname puede no ser correcto, usar path relativo desde proyecto
  const projectRoot = '/home/jordan/Escritorio/PROYECTO P3 OPERATIVOS/plugin-testing';
  try {
    const TestExecutor = require(path.join(projectRoot, 'src/plugin/core/executor'));
    const executor = new TestExecutor('http://localhost:3001');
    
    executor.executeAll().then(result => {
      console.log('\n✓ Tests completed');
      
      if (result.success && result.results) {
        const reportData = {
          timestamp: new Date().toISOString(),
          type: 'COMPLETE_SUITE',
          summary: generateSummary(result.results),
          details: result.results,
          generatedAt: new Date().toLocaleString('es-ES'),
          created_at: new Date().toISOString()
        };
        
        // Guardar en BD
        const reports = readDatabase();
        reports.push(reportData);
        writeDatabase(reports);
        console.log('✓ Report saved to database');
      }
    }).catch(err => {
      console.error('Error running tests:', err.message);
    });
  } catch (err) {
    console.error('Error loading test executor:', err.message);
  }
}

function generateSummary(results) {
  return {
    tests: results.map(r => ({
      type: r.type,
      status: `${r.summary.passed || 0}/${r.summary.total || 0}`,
      successRate: r.summary.successRate || 'N/A',
      duration: r.summary.duration || 'N/A'
    })),
    overall: {
      totalTests: results.reduce((acc, r) => acc + (r.summary.total || 0), 0),
      totalPassed: results.reduce((acc, r) => acc + (r.summary.passed || 0), 0),
      totalFailed: results.reduce((acc, r) => acc + (r.summary.failed || 0), 0)
    }
  };
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  server.close();
  process.exit(0);
});
