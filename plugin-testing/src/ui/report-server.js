const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const unzipper = require('unzipper');
const axios = require('axios');

// Importar el generador de reportes profesional
const ReportGenerator = require('../plugin/modules/report-generator/generator');

const app = express();
const PORT = process.env.PORT || 3002;
const REPORTS_DIR = path.join(__dirname, '../../reports');
const PLUGIN_DIR = path.join(__dirname, '../plugin/core');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Crear directorio de uploads si no existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configurar multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `project-${timestamp}.zip`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB máximo
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Estado del proyecto cargado y ejecución de tests
let loadedProject = null;
let testProcess = null;
let testStatus = { running: false, progress: '', logs: [] };

/**
 * Auto-detecta la URL funcional probando localhost y 127.0.0.1
 * @param {number} port - Puerto del servidor
 * @returns {Promise<string>} - URL funcional
 */
async function autoDetectUrl(port) {
  const hosts = ['localhost', '127.0.0.1'];
  
  for (const host of hosts) {
    const url = `http://${host}:${port}`;
    try {
      // Intentar conexión con timeout corto
      await axios.get(url, { timeout: 2000 });
      console.log(`[URL DETECT] ✓ ${url} is reachable`);
      return url;
    } catch (error) {
      // 401/403 también significa que el servidor está activo
      if (error.response && (error.response.status === 401 || error.response.status === 403 || error.response.status === 404)) {
        console.log(`[URL DETECT] ✓ ${url} is reachable (server responds with ${error.response.status})`);
        return url;
      }
      console.log(`[URL DETECT] ✗ ${url} failed: ${error.message}`);
    }
  }
  
  // Si ninguna funciona, usar localhost por defecto
  console.log(`[URL DETECT] Using default: http://localhost:${port}`);
  return `http://localhost:${port}`;
}

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
app.post('/api/project/load', async (req, res) => {
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

    // Detectar rutas del backend automáticamente
    if (projectInfo.hasServer) {
      try {
        const RouteDetector = require('../plugin/modules/route-detector/detector');
        const detector = new RouteDetector(projectPath);
        const routes = await detector.detectRoutes(projectInfo.serverFile);
        
        projectInfo.detectedRoutes = routes;
        projectInfo.testRoutes = detector.generateTestRoutes();
        
        console.log(`[LOAD PROJECT] Detected ${routes.length} routes`);
        if (routes.length > 0) {
          console.log(`[LOAD PROJECT] Sample routes:`, routes.slice(0, 5));
        }
      } catch (error) {
        console.error(`[LOAD PROJECT] Route detection error:`, error.message);
        projectInfo.detectedRoutes = [];
        projectInfo.testRoutes = null;
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

// Subir proyecto como ZIP (para versión web)
app.post('/api/project/upload-zip', upload.single('projectZip'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No ZIP file uploaded' });
    }

    console.log(`\n[UPLOAD ZIP] File received: ${req.file.originalname}`);
    console.log(`[UPLOAD ZIP] Size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    const zipPath = req.file.path;
    const timestamp = Date.now();
    const extractDir = path.join(UPLOADS_DIR, `project-${timestamp}`);

    // Crear directorio de extracción
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    console.log(`[UPLOAD ZIP] Extracting to: ${extractDir}`);

    // Extraer el ZIP
    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: extractDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Eliminar el archivo ZIP después de extraer
    fs.unlinkSync(zipPath);

    // Buscar el directorio del proyecto (puede estar dentro de una carpeta)
    let projectPath = extractDir;
    const items = fs.readdirSync(extractDir);
    
    // Si solo hay una carpeta, el proyecto está dentro de ella
    if (items.length === 1) {
      const singleItem = path.join(extractDir, items[0]);
      if (fs.statSync(singleItem).isDirectory()) {
        projectPath = singleItem;
      }
    }

    // Verificar que sea un proyecto válido (tiene package.json)
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      // Limpiar directorio
      fs.rmSync(extractDir, { recursive: true, force: true });
      return res.status(400).json({ 
        error: 'Invalid project: No package.json found. Make sure to ZIP a Node.js project folder.' 
      });
    }

    console.log(`[UPLOAD ZIP] Project path: ${projectPath}`);

    // Leer información del proyecto
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    let projectInfo = {
      path: projectPath,
      name: packageJson.name || path.basename(projectPath),
      type: 'nodejs',
      hasServer: false,
      serverFile: null,
      port: 3001,
      dependencies: packageJson.dependencies || {},
      scripts: packageJson.scripts || {},
      uploadedAt: new Date().toISOString()
    };

    // Buscar archivo de servidor
    const possibleServerFiles = ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js', 'src/backend/server.js'];
    for (const serverFile of possibleServerFiles) {
      const serverPath = path.join(projectPath, serverFile);
      if (fs.existsSync(serverPath)) {
        projectInfo.hasServer = true;
        projectInfo.serverFile = serverFile;
        
        // Intentar detectar el puerto
        try {
          const serverContent = fs.readFileSync(serverPath, 'utf8');
          const portMatch = serverContent.match(/(?:PORT|port)\s*(?:=|\|\|)\s*(\d{4})/);
          if (portMatch) {
            projectInfo.port = parseInt(portMatch[1]);
            console.log(`[UPLOAD ZIP] Detected port: ${projectInfo.port} from ${serverFile}`);
          }
        } catch (e) {}
        break;
      }
    }

    // Buscar archivos HTML (frontend)
    const htmlFiles = ['index.html', 'src/index.html', 'public/index.html'];
    for (const htmlFile of htmlFiles) {
      const htmlPath = path.join(projectPath, htmlFile);
      if (fs.existsSync(htmlPath)) {
        projectInfo.hasFrontend = true;
        projectInfo.frontendFile = htmlFile;
        break;
      }
    }

    console.log(`[UPLOAD ZIP] Project info:`, JSON.stringify(projectInfo, null, 2));

    loadedProject = projectInfo;
    
    res.json({ 
      success: true, 
      project: projectInfo,
      message: `Project "${projectInfo.name}" uploaded and extracted successfully`
    });

  } catch (error) {
    console.error('[UPLOAD ZIP] Error:', error);
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
      // Usar netstat para Windows, lsof para Unix
      const isWindows = process.platform === 'win32';
      const command = isWindows 
        ? `netstat -ano | findstr :${projectPort}`
        : `lsof -i :${projectPort}`;
      
      exec(command, (error, stdout) => {
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
    let packageJsonNeedsTypeModule = false;
    const projectPackageJsonPath = path.join(loadedProject.path, 'package.json');
    
    if (fs.existsSync(projectPackageJsonPath)) {
      try {
        const projectPkg = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
        useESModules = projectPkg.type === 'module';
        console.log(`[START SERVER] Package.json type: ${projectPkg.type || 'commonjs (default)'}`);
        console.log(`[START SERVER] ES Modules from package.json: ${useESModules ? 'Yes' : 'No'}`);
      } catch (e) {
        console.log(`[START SERVER] Could not read project package.json: ${e.message}`);
      }
    }

    // También detectar por extensión .mjs o contenido del archivo
    if (!useESModules && serverFilePath.endsWith('.mjs')) {
      useESModules = true;
      console.log(`[START SERVER] Detected .mjs extension`);
    }
    if (!useESModules) {
      try {
        const serverContent = fs.readFileSync(serverFilePath, 'utf8');
        if (serverContent.includes('import ') && serverContent.includes(' from ')) {
          useESModules = true;
          packageJsonNeedsTypeModule = true; // Necesita que agreguemos "type": "module"
          console.log(`[START SERVER] Detected ES Modules syntax in server file (needs type: module)`);
        }
      } catch (e) {}
    }

    // Si el proyecto usa sintaxis ESM pero no tiene "type": "module", convertir todo el proyecto
    if (packageJsonNeedsTypeModule && fs.existsSync(projectPackageJsonPath)) {
      try {
        const projectPkg = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
        projectPkg.type = 'module';
        fs.writeFileSync(projectPackageJsonPath, JSON.stringify(projectPkg, null, 2));
        console.log(`[START SERVER] Added "type": "module" to package.json`);
        
        // Convertir archivos CommonJS a ESM en el directorio src
        const convertCommonJSToESM = (dir) => {
          if (!fs.existsSync(dir)) return;
          const files = fs.readdirSync(dir);
          
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory() && !file.includes('node_modules')) {
              convertCommonJSToESM(filePath);
            } else if (file.endsWith('.js')) {
              try {
                let content = fs.readFileSync(filePath, 'utf8');
                let modified = false;
                const importsToAdd = [];
                
                // Convertir require('dotenv').config() a import 'dotenv/config'
                if (content.includes("require('dotenv').config()") || content.includes('require("dotenv").config()')) {
                  content = content.replace(/require\s*\(\s*['"]dotenv['"]\s*\)\.config\s*\(\s*\)\s*;?/g, "import 'dotenv/config';");
                  modified = true;
                }
                
                // Convertir const X = require('Y') a import X from 'Y'
                const simpleRequireRegex = /const\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
                let match;
                while ((match = simpleRequireRegex.exec(content)) !== null) {
                  modified = true;
                }
                content = content.replace(/const\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, varName, importPath) => {
                  // Agregar .js a rutas relativas sin extensión
                  if ((importPath.startsWith('./') || importPath.startsWith('../')) && 
                      !importPath.endsWith('.js') && !importPath.endsWith('.json') && !importPath.endsWith('.mjs')) {
                    importPath += '.js';
                  }
                  return `import ${varName} from '${importPath}'`;
                });
                
                // Convertir const { X, Y } = require('Z') a import { X, Y } from 'Z'
                if (content.includes('} = require(')) {
                  content = content.replace(/const\s*\{\s*([^}]+)\s*\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, vars, importPath) => {
                    // Agregar .js a rutas relativas sin extensión
                    if ((importPath.startsWith('./') || importPath.startsWith('../')) && 
                        !importPath.endsWith('.js') && !importPath.endsWith('.json') && !importPath.endsWith('.mjs')) {
                      importPath += '.js';
                    }
                    return `import { ${vars} } from '${importPath}'`;
                  });
                  modified = true;
                }
                
                // Convertir require('./routes/X') inline a imports + variable
                // Buscar todos los requires inline (dentro de funciones como app.use)
                const inlineRequireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
                const inlineMatches = [];
                let inlineMatch;
                const tempContent = content;
                while ((inlineMatch = inlineRequireRegex.exec(tempContent)) !== null) {
                  // Solo procesar si no es parte de una asignación const ya manejada
                  const beforeMatch = tempContent.substring(Math.max(0, inlineMatch.index - 50), inlineMatch.index);
                  if (!beforeMatch.includes('const ') && !beforeMatch.includes('import ')) {
                    inlineMatches.push({
                      full: inlineMatch[0],
                      path: inlineMatch[1]
                    });
                  }
                }
                
                // Procesar requires inline
                for (const req of inlineMatches) {
                  // Generar nombre de variable basado en el path
                  let varName = req.path
                    .replace(/^\.\//, '')
                    .replace(/^\.\.\//, '')
                    .replace(/\//g, '_')
                    .replace(/\.js$/, '')
                    .replace(/-/g, '_');
                  varName = varName + '_module';
                  
                  // Agregar .js si es ruta relativa sin extensión
                  let importPath = req.path;
                  if (importPath.startsWith('./') || importPath.startsWith('../')) {
                    if (!importPath.endsWith('.js') && !importPath.endsWith('.json')) {
                      importPath += '.js';
                    }
                  }
                  
                  // Agregar import al inicio
                  importsToAdd.push(`import ${varName} from '${importPath}';`);
                  
                  // Reemplazar require por la variable
                  content = content.replace(req.full, varName);
                  modified = true;
                }
                
                // Agregar imports al inicio del archivo (después de otros imports existentes)
                if (importsToAdd.length > 0) {
                  // Buscar la última línea de import
                  const lines = content.split('\n');
                  let lastImportIndex = -1;
                  for (let i = 0; i < lines.length; i++) {
                    if (lines[i].trim().startsWith('import ')) {
                      lastImportIndex = i;
                    }
                  }
                  
                  // Insertar los nuevos imports después del último import
                  const newImports = importsToAdd.join('\n');
                  if (lastImportIndex >= 0) {
                    lines.splice(lastImportIndex + 1, 0, newImports);
                  } else {
                    lines.unshift(newImports);
                  }
                  content = lines.join('\n');
                }
                
                // Convertir module.exports = X a export default X
                if (content.includes('module.exports')) {
                  content = content.replace(/module\.exports\s*=\s*/g, 'export default ');
                  modified = true;
                }
                
                // Convertir exports.X = Y a export const X = Y (casos simples)
                if (content.includes('exports.') && !content.includes('module.exports')) {
                  content = content.replace(/exports\.(\w+)\s*=\s*/g, 'export const $1 = ');
                  modified = true;
                }
                
                // Agregar .js a imports relativos existentes que no tienen extensión
                // Esto maneja imports que ya estaban en ESM pero sin extensión
                content = content.replace(/import\s+(.+?)\s+from\s+['"](\.[^'"]+)['"]/g, (match, what, importPath) => {
                  if (!importPath.endsWith('.js') && !importPath.endsWith('.json') && !importPath.endsWith('.mjs') && !importPath.includes('/config')) {
                    return `import ${what} from '${importPath}.js'`;
                  }
                  return match;
                });
                
                if (modified) {
                  fs.writeFileSync(filePath, content);
                  console.log(`[START SERVER] Converted to ESM: ${filePath}`);
                }
              } catch (e) {
                console.log(`[START SERVER] Could not convert ${filePath}: ${e.message}`);
              }
            }
          }
        };
        
        // Convertir archivos en src/ y en la raíz
        convertCommonJSToESM(path.join(loadedProject.path, 'src'));
        convertCommonJSToESM(loadedProject.path);
        
      } catch (e) {
        console.log(`[START SERVER] Could not modify package.json: ${e.message}`);
      }
    }

    // Construir argumentos de node - ya no necesitamos flags especiales si package.json tiene type: module
    const nodeArgs = [serverFilePath];
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
      // Solo guardar como error si es un error real, no warnings
      if (output.includes('SyntaxError') || 
          output.includes('Error:') || 
          output.includes('Cannot find module') ||
          output.includes('does not provide an export')) {
        serverError = output;
      }
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
app.post('/api/project/run-tests', async (req, res) => {
  try {
    if (testStatus.running) {
      return res.status(400).json({ error: 'Tests already running' });
    }

    const { testType, baseUrl } = req.body;
    const port = loadedProject?.port || 3001;
    
    // Opción 3: Auto-detectar URL funcional si no se proporciona una baseUrl
    let targetUrl;
    if (baseUrl) {
      targetUrl = baseUrl;
    } else {
      console.log('[RUN TESTS] Auto-detecting functional URL...');
      targetUrl = await autoDetectUrl(port);
    }

    // Log para depuración
    console.log('\n========================================');
    console.log('[DEBUG] Run Tests Request:');
    console.log(`  - Received baseUrl: ${baseUrl}`);
    console.log(`  - Auto-detected URL: ${targetUrl}`);
    console.log(`  - loadedProject port: ${loadedProject?.port}`);
    console.log('========================================\n');

    testStatus = { running: true, progress: 'Starting tests...', logs: [] };

    const cliPath = path.join(PLUGIN_DIR, 'cli.js');
    const args = testType ? [`--${testType}`] : ['--all'];

    // Preparar environment con rutas detectadas
    const testEnv = { 
      ...process.env, 
      BASE_URL: targetUrl
    };
    
    // Agregar rutas detectadas si existen
    if (loadedProject?.detectedRoutes && loadedProject.detectedRoutes.length > 0) {
      testEnv.DETECTED_ROUTES = JSON.stringify(loadedProject.detectedRoutes);
      console.log(`[RUN TESTS] Using ${loadedProject.detectedRoutes.length} detected routes`);
    }

    testProcess = spawn('node', [cliPath, ...args], {
      env: testEnv,
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
