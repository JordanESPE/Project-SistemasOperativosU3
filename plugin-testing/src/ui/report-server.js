const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = 3002;
const REPORTS_DIR = path.join(__dirname, '../../reports');
const PLUGIN_DIR = path.join(__dirname, '../plugin/core');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Estado del proyecto cargado y ejecución de tests
let loadedProject = null;
let testProcess = null;
let testStatus = { running: false, progress: '', logs: [] };

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

// ========================================
// ENDPOINTS PARA CARGA Y ANÁLISIS DE PROYECTOS
// ========================================

// Explorador de archivos del sistema
app.get('/api/browse', (req, res) => {
  try {
    let dirPath = req.query.path || '/home';
    
    // Normalizar la ruta
    dirPath = path.resolve(dirPath);
    
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory does not exist' });
    }
    
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }
    
    const items = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Ignorar archivos/carpetas ocultos y algunos directorios del sistema
      if (entry.name.startsWith('.')) continue;
      if (['node_modules', '__pycache__', '.git'].includes(entry.name)) continue;
      
      try {
        const fullPath = path.join(dirPath, entry.name);
        const isDir = entry.isDirectory();
        
        // Verificar si es un proyecto (tiene package.json)
        let isProject = false;
        if (isDir) {
          const pkgPath = path.join(fullPath, 'package.json');
          isProject = fs.existsSync(pkgPath);
        }
        
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: isDir,
          isProject: isProject
        });
      } catch (e) {
        // Ignorar errores de permisos
      }
    }
    
    // Ordenar: carpetas primero, luego por nombre
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({
      currentPath: dirPath,
      parentPath: path.dirname(dirPath),
      items: items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cargar/Seleccionar un proyecto
app.post('/api/project/load', (req, res) => {
  try {
    const { projectPath } = req.body;
    
    if (!projectPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'Project path does not exist' });
    }

    // Verificar si tiene package.json (proyecto Node.js)
    const packageJsonPath = path.join(projectPath, 'package.json');
    let projectInfo = {
      path: projectPath,
      name: path.basename(projectPath),
      type: 'unknown',
      hasServer: false,
      serverFile: null,
      port: null
    };

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      projectInfo.name = packageJson.name || projectInfo.name;
      projectInfo.type = 'nodejs';
      projectInfo.dependencies = packageJson.dependencies || {};
      projectInfo.scripts = packageJson.scripts || {};

      // Buscar archivo de servidor
      const possibleServerFiles = ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js', 'src/backend/server.js'];
      for (const serverFile of possibleServerFiles) {
        const serverPath = path.join(projectPath, serverFile);
        if (fs.existsSync(serverPath)) {
          projectInfo.hasServer = true;
          projectInfo.serverFile = serverFile;
          
          // Intentar detectar puerto
          const serverContent = fs.readFileSync(serverPath, 'utf8');
          const portMatch = serverContent.match(/(?:PORT|port)\s*(?:=|:)\s*(\d+)/);
          if (portMatch) {
            projectInfo.port = parseInt(portMatch[1]);
          }
          break;
        }
      }
    }

    // Buscar archivos HTML (proyecto frontend)
    const htmlFiles = ['index.html', 'src/index.html', 'public/index.html', 'src/frontend/index.html'];
    for (const htmlFile of htmlFiles) {
      const htmlPath = path.join(projectPath, htmlFile);
      if (fs.existsSync(htmlPath)) {
        projectInfo.hasFrontend = true;
        projectInfo.frontendFile = htmlFile;
        break;
      }
    }

    loadedProject = projectInfo;
    
    res.json({ 
      success: true, 
      project: projectInfo,
      message: `Project "${projectInfo.name}" loaded successfully`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener proyecto cargado
app.get('/api/project/current', (req, res) => {
  if (!loadedProject) {
    return res.status(404).json({ error: 'No project loaded' });
  }
  res.json(loadedProject);
});

// Iniciar servidor del proyecto
app.post('/api/project/start-server', async (req, res) => {
  try {
    if (!loadedProject) {
      return res.status(400).json({ error: 'No project loaded' });
    }

    const { port } = req.body;
    const projectPort = port || loadedProject.port || 3001;

    // Verificar si ya hay algo corriendo en ese puerto
    const checkPort = await new Promise((resolve) => {
      exec(`lsof -i :${projectPort}`, (error, stdout) => {
        resolve(stdout.trim().length > 0);
      });
    });

    if (checkPort) {
      return res.json({ 
        success: true, 
        message: `Server already running on port ${projectPort}`,
        port: projectPort,
        alreadyRunning: true
      });
    }

    // Instalar dependencias si no existen node_modules
    const nodeModulesPath = path.join(loadedProject.path, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      await new Promise((resolve, reject) => {
        exec('npm install', { cwd: loadedProject.path }, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
    }

    // Iniciar el servidor
    const serverProcess = spawn('node', [loadedProject.serverFile], {
      cwd: loadedProject.path,
      env: { ...process.env, PORT: projectPort },
      detached: true,
      stdio: 'ignore'
    });

    serverProcess.unref();

    // Esperar a que el servidor esté listo
    await new Promise(resolve => setTimeout(resolve, 2000));

    res.json({ 
      success: true, 
      message: `Server started on port ${projectPort}`,
      port: projectPort,
      pid: serverProcess.pid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ejecutar pruebas
app.post('/api/project/run-tests', (req, res) => {
  try {
    if (testStatus.running) {
      return res.status(400).json({ error: 'Tests already running' });
    }

    const { testType, baseUrl } = req.body;
    const targetUrl = baseUrl || `http://localhost:${loadedProject?.port || 3001}`;

    testStatus = { running: true, progress: 'Starting tests...', logs: [] };

    const cliPath = path.join(PLUGIN_DIR, 'cli.js');
    const args = testType ? [`--${testType}`] : ['--all'];

    testProcess = spawn('node', [cliPath, ...args], {
      env: { ...process.env, BASE_URL: targetUrl },
      cwd: path.join(__dirname, '../..')
    });

    testProcess.stdout.on('data', (data) => {
      const log = data.toString();
      testStatus.logs.push(log);
      testStatus.progress = log.trim().split('\n').pop();
      console.log(log);
    });

    testProcess.stderr.on('data', (data) => {
      const log = data.toString();
      testStatus.logs.push(`[ERROR] ${log}`);
      console.error(log);
    });

    testProcess.on('close', (code) => {
      testStatus.running = false;
      testStatus.progress = code === 0 ? 'Tests completed successfully' : 'Tests finished with errors';
      testProcess = null;
    });

    res.json({ 
      success: true, 
      message: 'Tests started',
      testType: testType || 'all'
    });
  } catch (error) {
    testStatus.running = false;
    res.status(500).json({ error: error.message });
  }
});

// Obtener estado de ejecución de pruebas
app.get('/api/project/test-status', (req, res) => {
  res.json(testStatus);
});

// Cancelar ejecución de pruebas
app.post('/api/project/cancel-tests', (req, res) => {
  if (testProcess) {
    testProcess.kill('SIGTERM');
    testStatus.running = false;
    testStatus.progress = 'Tests cancelled';
    testProcess = null;
  }
  res.json({ success: true, message: 'Tests cancelled' });
});

// Exportar reporte como PDF (genera HTML para imprimir)
app.post('/api/export-pdf', (req, res) => {
  try {
    const reportData = req.body;
    
    if (!reportData) {
      return res.status(400).json({ error: 'No report data provided' });
    }

    const summary = reportData.summary || {};
    const details = reportData.details || {};
    const overall = summary.overall || {};
    const tests = summary.tests || [];

    // Generar HTML para el PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reporte de Pruebas - ${new Date().toLocaleDateString('es-ES')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #6c5ce7; }
    .header h1 { color: #6c5ce7; font-size: 28px; margin-bottom: 10px; }
    .header p { color: #666; font-size: 14px; }
    .summary-section { margin-bottom: 40px; }
    .summary-section h2 { color: #2d3436; font-size: 20px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #dfe6e9; }
    .overall-stats { display: flex; justify-content: space-around; background: linear-gradient(135deg, #6c5ce7, #a29bfe); padding: 30px; border-radius: 12px; color: white; margin-bottom: 30px; }
    .stat-box { text-align: center; }
    .stat-box .value { font-size: 36px; font-weight: bold; display: block; }
    .stat-box .label { font-size: 14px; opacity: 0.9; }
    .tests-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .test-card { background: #f8f9fa; padding: 20px; border-radius: 10px; border-left: 4px solid #6c5ce7; }
    .test-card h3 { color: #2d3436; font-size: 16px; margin-bottom: 15px; text-transform: capitalize; }
    .test-card .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #dfe6e9; font-size: 14px; }
    .test-card .stat:last-child { border-bottom: none; }
    .test-card .stat .label { color: #636e72; }
    .test-card .stat .value { font-weight: 600; }
    .test-card .stat .value.passed { color: #00b894; }
    .test-card .stat .value.failed { color: #d63031; }
    .details-section { margin-top: 40px; page-break-before: always; }
    .details-section h2 { color: #2d3436; font-size: 20px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #dfe6e9; }
    .detail-group { margin-bottom: 30px; }
    .detail-group h3 { color: #6c5ce7; font-size: 16px; margin-bottom: 15px; }
    .test-list { list-style: none; }
    .test-list li { padding: 10px 15px; background: #f8f9fa; margin-bottom: 8px; border-radius: 6px; display: flex; align-items: center; font-size: 14px; }
    .test-list li .status { margin-right: 12px; font-size: 16px; }
    .test-list li .name { flex: 1; }
    .test-list li .duration { color: #636e72; font-size: 12px; }
    .footer { margin-top: 50px; text-align: center; color: #636e72; font-size: 12px; padding-top: 20px; border-top: 1px solid #dfe6e9; }
    @media print { body { padding: 20px; } .overall-stats { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ Reporte de Pruebas</h1>
    <p>Generado el ${new Date().toLocaleString('es-ES')}</p>
  </div>

  <div class="summary-section">
    <h2>📊 Resumen General</h2>
    <div class="overall-stats">
      <div class="stat-box">
        <span class="value">${overall.totalTests || 0}</span>
        <span class="label">Total Pruebas</span>
      </div>
      <div class="stat-box">
        <span class="value">${overall.totalPassed || 0}</span>
        <span class="label">Pasadas</span>
      </div>
      <div class="stat-box">
        <span class="value">${overall.totalFailed || 0}</span>
        <span class="label">Fallidas</span>
      </div>
      <div class="stat-box">
        <span class="value">${overall.successRate || '0%'}</span>
        <span class="label">Tasa de Éxito</span>
      </div>
    </div>

    <div class="tests-grid">
      ${tests.map(test => `
        <div class="test-card">
          <h3>${(test.type || 'Test').replace(/_/g, ' ')}</h3>
          <div class="stat">
            <span class="label">Estado:</span>
            <span class="value ${test.status === 'passed' ? 'passed' : 'failed'}">${test.status || 'N/A'}</span>
          </div>
          <div class="stat">
            <span class="label">Tasa de Éxito:</span>
            <span class="value passed">${test.successRate || 'N/A'}</span>
          </div>
          <div class="stat">
            <span class="label">Duración:</span>
            <span class="value">${test.duration || 'N/A'}</span>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  ${Object.keys(details).length > 0 ? `
  <div class="details-section">
    <h2>📋 Detalles de Pruebas</h2>
    ${Object.entries(details).map(([category, data]) => `
      <div class="detail-group">
        <h3>${category.replace(/_/g, ' ').toUpperCase()}</h3>
        <ul class="test-list">
          ${(data.tests || []).map(test => `
            <li>
              <span class="status">${test.status === 'passed' || test.passed ? '✅' : '❌'}</span>
              <span class="name">${test.name || test.description || 'Test'}</span>
              ${test.duration ? `<span class="duration">${test.duration}</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <div class="footer">
    <p>Generado por Testing Plugin - Sistema de Pruebas Automatizadas</p>
  </div>
</body>
</html>
    `;

    // Enviar como HTML para que el usuario pueda imprimir como PDF
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-pruebas-${Date.now()}.html"`);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Escanear directorio para proyectos
app.post('/api/project/scan-directory', (req, res) => {
  try {
    const { directoryPath } = req.body;
    
    if (!directoryPath || !fs.existsSync(directoryPath)) {
      return res.status(400).json({ error: 'Invalid directory path' });
    }

    const items = fs.readdirSync(directoryPath, { withFileTypes: true });
    const projects = [];

    for (const item of items) {
      if (item.isDirectory()) {
        const projectPath = path.join(directoryPath, item.name);
        const packageJsonPath = path.join(projectPath, 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            projects.push({
              name: packageJson.name || item.name,
              path: projectPath,
              description: packageJson.description || '',
              type: 'nodejs'
            });
          } catch (e) {
            // Ignorar proyectos con package.json inválido
          }
        }
      }
    }

    res.json({ projects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// SERVIR ARCHIVOS ESTÁTICOS Y SPA
// ========================================

// Servir archivos estáticos de la carpeta build
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));

// SPA fallback - servir index.html para cualquier ruta no encontrada
app.get('*', (req, res) => {
  // Excluir rutas de API
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(buildPath, 'index.html'));
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Report API server running on http://localhost:${PORT}`);
  console.log(`Serving static files from: ${buildPath}`);
});
