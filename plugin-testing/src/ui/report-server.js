const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const PDFDocument = require('pdfkit');

// Importar el generador de reportes profesional
const ReportGenerator = require('../plugin/modules/report-generator/generator');

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

    console.log(`\n[LOAD PROJECT] Loading: ${projectPath}`);

    // Verificar si tiene package.json (proyecto Node.js)
    const packageJsonPath = path.join(projectPath, 'package.json');
    let projectInfo = {
      path: projectPath,
      name: path.basename(projectPath),
      type: 'unknown',
      hasServer: false,
      serverFile: null,
      port: 3001  // Puerto por defecto
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
          
          // Intentar detectar puerto con múltiples patrones
          const serverContent = fs.readFileSync(serverPath, 'utf8');
          // Patrones: PORT = 3000, port: 3000, || 3000, listen(3000)
          const portPatterns = [
            /(?:PORT|port)\s*(?:=|:)\s*(\d+)/,
            /\|\|\s*(\d{4})/,  // || 3000
            /listen\s*\(\s*(\d+)/,  // listen(3000)
            /\.env\.PORT.*?(\d{4})/  // process.env.PORT || 3000
          ];
          
          for (const pattern of portPatterns) {
            const portMatch = serverContent.match(pattern);
            if (portMatch) {
              projectInfo.port = parseInt(portMatch[1]);
              console.log(`[LOAD PROJECT] Detected port: ${projectInfo.port} from ${serverFile}`);
              break;
            }
          }
          break;
        }
      }
    }

    console.log(`[LOAD PROJECT] Project info:`, JSON.stringify(projectInfo, null, 2));

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

// Variable para guardar el proceso del servidor del proyecto
let projectServerProcess = null;

// Descargar proyecto y limpiar estado
app.post('/api/project/unload', (req, res) => {
  console.log('[UNLOAD] Descargando proyecto actual...');
  
  // Matar proceso del servidor si existe
  if (projectServerProcess) {
    console.log('[UNLOAD] Matando proceso del servidor del proyecto...');
    try {
      projectServerProcess.kill('SIGTERM');
      projectServerProcess = null;
      console.log('[UNLOAD] Proceso del servidor terminado');
    } catch (e) {
      console.log('[UNLOAD] Error al matar proceso:', e.message);
    }
  }
  
  // Limpiar proyecto cargado
  const previousProject = loadedProject;
  loadedProject = null;
  
  console.log('[UNLOAD] Proyecto descargado:', previousProject?.name || 'ninguno');
  res.json({ 
    success: true, 
    message: 'Proyecto descargado correctamente',
    previousProject: previousProject?.name || null
  });
});

// Iniciar servidor del proyecto
app.post('/api/project/start-server', async (req, res) => {
  try {
    if (!loadedProject) {
      return res.status(400).json({ error: 'No project loaded' });
    }

    if (!loadedProject.hasServer || !loadedProject.serverFile) {
      return res.status(400).json({ error: 'Project does not have a server file' });
    }

    const { port } = req.body;
    const projectPort = port || loadedProject.port || 3001;

    console.log(`\n[START SERVER] Attempting to start server...`);
    console.log(`  - Project path: ${loadedProject.path}`);
    console.log(`  - Server file: ${loadedProject.serverFile}`);
    console.log(`  - Port: ${projectPort}`);

    // Verificar si ya hay algo corriendo en ese puerto
    const checkPort = await new Promise((resolve) => {
      exec(`lsof -i :${projectPort}`, (error, stdout) => {
        resolve(stdout.trim().length > 0);
      });
    });

    if (checkPort) {
      console.log(`[START SERVER] Port ${projectPort} already in use`);
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
      console.log(`[START SERVER] Installing dependencies...`);
      await new Promise((resolve, reject) => {
        exec('npm install', { cwd: loadedProject.path, timeout: 120000 }, (error, stdout, stderr) => {
          if (error) {
            console.error(`[START SERVER] npm install error: ${error.message}`);
            reject(error);
          } else {
            console.log(`[START SERVER] Dependencies installed`);
            resolve(stdout);
          }
        });
      });
    }

    // Matar proceso anterior si existe
    if (projectServerProcess) {
      try {
        projectServerProcess.kill();
      } catch (e) {}
      projectServerProcess = null;
    }

    // Construir la ruta completa al archivo del servidor
    const serverFilePath = path.join(loadedProject.path, loadedProject.serverFile);
    
    if (!fs.existsSync(serverFilePath)) {
      return res.status(400).json({ error: `Server file not found: ${serverFilePath}` });
    }

    // Detectar si el proyecto usa ES Modules
    let useESModules = false;
    const projectPackageJsonPath = path.join(loadedProject.path, 'package.json');
    if (fs.existsSync(projectPackageJsonPath)) {
      try {
        const projectPkg = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
        useESModules = projectPkg.type === 'module';
        console.log(`[START SERVER] ES Modules: ${useESModules ? 'Yes' : 'No'}`);
      } catch (e) {
        console.log(`[START SERVER] Could not read project package.json: ${e.message}`);
      }
    }

    // También detectar por extensión .mjs o contenido del archivo
    if (!useESModules && serverFilePath.endsWith('.mjs')) {
      useESModules = true;
    }
    if (!useESModules) {
      try {
        const serverContent = fs.readFileSync(serverFilePath, 'utf8');
        if (serverContent.includes('import ') && serverContent.includes(' from ')) {
          useESModules = true;
          console.log(`[START SERVER] Detected ES Modules syntax in server file`);
        }
      } catch (e) {}
    }

    // Construir argumentos de node
    const nodeArgs = useESModules ? ['--experimental-specifier-resolution=node', serverFilePath] : [serverFilePath];
    console.log(`[START SERVER] Executing: node ${nodeArgs.join(' ')}`);

    // Iniciar el servidor con pipe para capturar output
    projectServerProcess = spawn('node', nodeArgs, {
      cwd: loadedProject.path,
      env: { ...process.env, PORT: projectPort.toString() },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverStarted = false;
    let serverError = null;

    // Capturar stdout
    projectServerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[PROJECT SERVER] ${output}`);
      // Detectar si el servidor arrancó
      if (output.toLowerCase().includes('listening') || 
          output.toLowerCase().includes('running') ||
          output.toLowerCase().includes('started') ||
          output.includes(projectPort.toString())) {
        serverStarted = true;
      }
    });

    // Capturar stderr
    projectServerProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[PROJECT SERVER ERROR] ${output}`);
      serverError = output;
    });

    // Manejar errores del proceso
    projectServerProcess.on('error', (error) => {
      console.error(`[START SERVER] Process error: ${error.message}`);
      serverError = error.message;
    });

    // Manejar cierre del proceso
    projectServerProcess.on('close', (code) => {
      console.log(`[START SERVER] Process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        projectServerProcess = null;
      }
    });

    // Esperar a que el servidor esté listo (máximo 10 segundos)
    let attempts = 0;
    const maxAttempts = 20;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verificar si el puerto está ahora en uso
      const portInUse = await new Promise((resolve) => {
        exec(`lsof -i :${projectPort}`, (error, stdout) => {
          resolve(stdout.trim().length > 0);
        });
      });
      
      if (portInUse || serverStarted) {
        console.log(`[START SERVER] Server is now running on port ${projectPort}`);
        return res.json({ 
          success: true, 
          message: `Server started on port ${projectPort}`,
          port: projectPort,
          pid: projectServerProcess?.pid
        });
      }
      
      if (serverError) {
        return res.status(500).json({ 
          error: `Failed to start server: ${serverError}` 
        });
      }
      
      attempts++;
    }

    // Timeout
    return res.status(500).json({ 
      error: `Server failed to start within 10 seconds. Check if the server file is correct.` 
    });

  } catch (error) {
    console.error(`[START SERVER] Error: ${error.message}`);
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

    // Log para depuración
    console.log('\n========================================');
    console.log('[DEBUG] Run Tests Request:');
    console.log(`  - Received baseUrl: ${baseUrl}`);
    console.log(`  - Using targetUrl: ${targetUrl}`);
    console.log(`  - loadedProject port: ${loadedProject?.port}`);
    console.log('========================================\n');

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

// Exportar reporte como PDF usando el generador profesional
app.post('/api/export-pdf', async (req, res) => {
  try {
    const reportData = req.body;
    
    if (!reportData) {
      return res.status(400).json({ error: 'No report data provided' });
    }

    // Convertir el formato del reporte de la UI al formato esperado por el generador
    const testResults = [];
    
    // Si tiene details como array (formato del JSON guardado)
    if (Array.isArray(reportData.details)) {
      testResults.push(...reportData.details);
    } 
    // Si tiene details como objeto (formato de la UI)
    else if (reportData.details && typeof reportData.details === 'object') {
      Object.entries(reportData.details).forEach(([type, data]) => {
        testResults.push({
          type: type.toUpperCase(),
          timestamp: data.timestamp || new Date().toISOString(),
          summary: data.summary || {
            total: data.tests?.length || 0,
            passed: data.tests?.filter(t => t.status === 'passed' || t.passed).length || 0,
            failed: data.tests?.filter(t => t.status === 'failed' || !t.passed).length || 0,
            successRate: data.successRate || 'N/A',
            duration: data.duration || 'N/A'
          },
          details: data.tests || []
        });
      });
    }
    
    // Si también tiene summary.tests, usarlos para completar información
    if (reportData.summary?.tests && testResults.length === 0) {
      reportData.summary.tests.forEach(test => {
        testResults.push({
          type: test.type || 'TEST',
          timestamp: new Date().toISOString(),
          summary: {
            total: parseInt(test.status?.split('/')[1]) || 0,
            passed: parseInt(test.status?.split('/')[0]) || 0,
            failed: (parseInt(test.status?.split('/')[1]) || 0) - (parseInt(test.status?.split('/')[0]) || 0),
            successRate: test.successRate || 'N/A',
            duration: test.duration || 'N/A'
          },
          details: []
        });
      });
    }

    // Crear instancia del generador con directorio temporal
    const tempDir = path.join(__dirname, '../../temp-exports');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const generator = new ReportGenerator(tempDir);
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    
    // Generar el PDF usando el generador profesional
    const pdfPath = await generator.generatePDF(testResults, timestamp);
    
    // Leer el PDF generado y enviarlo como respuesta
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="test-report-${timestamp}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Enviar el PDF
    res.send(pdfBuffer);
    
    // Limpiar archivo temporal después de enviar
    setTimeout(() => {
      try {
        fs.unlinkSync(pdfPath);
      } catch (e) {
        // Ignorar errores de limpieza
      }
    }, 5000);

  } catch (error) {
    console.error('Error generating PDF:', error);
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

// Servir archivos estáticos de la carpeta build o public si build no existe
let buildPath = path.join(__dirname, 'build');
if (!fs.existsSync(buildPath)) {
  buildPath = path.join(__dirname, 'public');
}
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
