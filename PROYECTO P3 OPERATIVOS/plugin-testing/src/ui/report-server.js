const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3002;
const REPORTS_DIR = path.join(__dirname, '../../reports');

app.use(cors());
app.use(express.json());

// Endpoint para obtener el último reporte
app.get('/api/latest-report', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.status(404).json({ error: 'Reports directory not found' });
    }

    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      return res.status(404).json({ error: 'No reports found' });
    }

    const latestFile = files[0];
    const reportPath = path.join(REPORTS_DIR, latestFile);
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    res.json(reportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para listar todos los reportes
app.get('/api/reports', (req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      return res.json([]);
    }

    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const reports = files.map(f => ({
      name: f,
      path: f
    }));

    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener un reporte específico
app.get('/api/reports/:filename', (req, res) => {
  try {
    const filepath = path.join(REPORTS_DIR, req.params.filename);
    
    // Validar que no haya path traversal
    if (!filepath.startsWith(REPORTS_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    res.json(reportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Report API server running on http://localhost:${PORT}`);
});
