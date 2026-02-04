const fs = require('fs');
const path = require('path');

class RouteDetector {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.routes = [];
    this.routePrefixes = new Map(); // Guarda prefijos de app.use()
  }

  /**
   * Detecta rutas analizando archivos del proyecto
   */
  async detectRoutes(serverFile = 'server.js') {
    const routes = new Set();
    
    try {
      // 1. Buscar en el archivo principal del servidor para encontrar prefijos
      const serverPath = path.join(this.projectPath, serverFile);
      if (fs.existsSync(serverPath)) {
        const serverContent = fs.readFileSync(serverPath, 'utf-8');
        this.extractRoutePrefixes(serverContent);
        this.extractRoutesFromContent(serverContent, routes, '');
      }

      // 2. Buscar en carpeta de rutas comunes
      const routeFolders = ['routes', 'api', 'controllers', 'src/routes', 'src/api'];
      for (const folder of routeFolders) {
        const folderPath = path.join(this.projectPath, folder);
        if (fs.existsSync(folderPath)) {
          this.scanRouteFolder(folderPath, routes);
        }
      }

      // 3. Post-procesar rutas: combinar y limpiar
      this.routes = this.postProcessRoutes(Array.from(routes));
      
      console.log(`[ROUTE DETECTOR] Found ${this.routes.length} routes:`, this.routes);
      
      return this.routes;
    } catch (error) {
      console.error('[ROUTE DETECTOR] Error detecting routes:', error.message);
      return [];
    }
  }

  /**
   * Extrae prefijos de rutas de app.use()
   */
  extractRoutePrefixes(content) {
    // Buscar patrones como: app.use('/api/auth', authRoutes)
    const usePattern = /app\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)/g;
    let match;
    
    while ((match = usePattern.exec(content)) !== null) {
      const prefix = match[1];
      const routerName = match[2].toLowerCase();
      this.routePrefixes.set(routerName, prefix);
    }
  }

  /**
   * Extrae rutas de un contenido de archivo
   */
  extractRoutesFromContent(content, routes, filePrefix = '') {
    // Determinar si este archivo corresponde a un prefijo conocido
    let prefix = filePrefix;
    
    // Patrones para detectar rutas Express
    const patterns = [
      // app.get('/api/users', ...) o router.get('/users', ...)
      /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      // router.route('/users')
      /router\.route\s*\(\s*['"`]([^'"`]+)['"`]/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const route = match[2] || match[1];
        if (route && route.startsWith('/')) {
          // Limpiar parámetros de ruta
          const cleanRoute = route.replace(/:[^/]+/g, ':id');
          
          // Agregar ruta con prefijo si corresponde
          if (prefix && !cleanRoute.startsWith(prefix)) {
            routes.add(prefix + cleanRoute);
          } else {
            routes.add(cleanRoute);
          }
        }
      }
    });

    // Buscar también prefijos de app.use dentro del archivo
    const usePattern = /app\.use\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let useMatch;
    while ((useMatch = usePattern.exec(content)) !== null) {
      const useRoute = useMatch[1];
      if (useRoute && useRoute.startsWith('/')) {
        routes.add(useRoute);
      }
    }
  }

  /**
   * Escanea una carpeta de rutas recursivamente
   */
  scanRouteFolder(folderPath, routes) {
    try {
      const files = fs.readdirSync(folderPath);
      
      files.forEach(file => {
        const filePath = path.join(folderPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          this.scanRouteFolder(filePath, routes);
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Determinar prefijo basado en nombre del archivo
          const baseName = file.replace(/\.(js|ts)$/, '').toLowerCase();
          let prefix = '';
          
          // Buscar si hay un prefijo registrado para este archivo
          for (const [routerName, routePrefix] of this.routePrefixes) {
            if (baseName.includes(routerName) || routerName.includes(baseName)) {
              prefix = routePrefix;
              break;
            }
          }
          
          // Si el archivo tiene 'auth', 'user', etc., asumir prefijos comunes
          if (!prefix) {
            if (baseName.includes('auth')) prefix = '/api/auth';
            else if (baseName.includes('user')) prefix = '/api/users';
            else if (baseName.includes('product')) prefix = '/api/products';
            else if (baseName.includes('order')) prefix = '/api/orders';
            else if (baseName.includes('cart')) prefix = '/api/cart';
            else if (baseName.includes('categor')) prefix = '/api/categories';
            else if (baseName.includes('reserva')) prefix = '/api/reservas';
            else if (baseName.includes('course')) prefix = '/api/courses';
            else if (baseName.includes('student')) prefix = '/api/students';
            else if (baseName.includes('enroll')) prefix = '/api/enrollments';
          }
          
          this.extractRoutesFromContent(content, routes, prefix);
        }
      });
    } catch (error) {
      console.error(`[ROUTE DETECTOR] Error scanning folder ${folderPath}:`, error.message);
    }
  }

  /**
   * Post-procesa las rutas para combinar y limpiar
   */
  postProcessRoutes(routes) {
    const processed = new Set();
    const prefixes = new Set();
    
    // Primero, encontrar todos los prefijos (rutas que terminan siendo padres)
    for (const route of routes) {
      if (route.match(/^\/api\/\w+$/)) {
        prefixes.add(route);
      }
    }
    
    // Procesar cada ruta
    for (const route of routes) {
      // Ignorar rutas demasiado genéricas sin contexto
      if (route === '/' || route === '/:id') {
        continue;
      }
      
      // Si es una subruta simple (login, register) sin prefijo /api
      if ((route === '/login' || route === '/register') && prefixes.has('/api/auth')) {
        processed.add('/api/auth' + route);
        continue;
      }
      
      // Si la ruta ya tiene /api, agregarla directamente
      if (route.startsWith('/api/')) {
        processed.add(route);
        continue;
      }
      
      // Para otras rutas, verificar si encajan con algún prefijo
      let matched = false;
      for (const prefix of prefixes) {
        if (route.startsWith('/') && !route.startsWith('/api')) {
          // Es posible que sea una subruta
          const combined = prefix + route;
          // Solo agregar si tiene sentido
          if (this.isValidRoute(combined)) {
            processed.add(combined);
            matched = true;
            break;
          }
        }
      }
      
      // Si no coincide con ningún prefijo, agregar la ruta original (excepto genéricas)
      if (!matched && route.startsWith('/api')) {
        processed.add(route);
      }
    }
    
    // Agregar prefijos como rutas válidas también
    for (const prefix of prefixes) {
      processed.add(prefix);
    }
    
    return Array.from(processed).sort();
  }

  /**
   * Verifica si una ruta combinada es válida
   */
  isValidRoute(route) {
    // Evitar rutas duplicadas como /api/auth/api/auth
    if (route.includes('/api/') && route.indexOf('/api/') !== route.lastIndexOf('/api/')) {
      return false;
    }
    return true;
  }

  /**
   * Genera rutas de prueba genéricas basadas en las detectadas
   */
  generateTestRoutes() {
    const testRoutes = {
      health: [],
      get: [],
      post: [],
      put: [],
      delete: []
    };

    this.routes.forEach(route => {
      // Health check
      if (route.includes('health') || route === '/') {
        testRoutes.health.push(route);
      }
      
      // GET routes (sin parámetros)
      if (!route.includes(':id') && !route.includes('auth')) {
        testRoutes.get.push(route);
      }
      
      // POST routes (auth, create)
      if (route.includes('auth') || route.includes('register') || route.includes('login')) {
        testRoutes.post.push(route);
      }
    });

    // Si no hay rutas detectadas, usar rutas por defecto
    if (this.routes.length === 0) {
      return {
        health: ['/api/health', '/health', '/'],
        get: ['/api/products', '/api/users', '/api/items'],
        post: ['/api/auth/register', '/api/auth/login'],
        put: [],
        delete: []
      };
    }

    return testRoutes;
  }

  /**
   * Obtiene la mejor ruta para health check
   */
  getHealthCheckRoute() {
    const healthRoutes = this.routes.filter(r => 
      r.includes('health') || r === '/' || r === '/api'
    );
    
    return healthRoutes[0] || '/api/health';
  }

  /**
   * Obtiene rutas GET disponibles
   */
  getGetRoutes() {
    return this.routes.filter(r => 
      !r.includes(':id') && 
      !r.includes('auth') &&
      !r.includes('login') &&
      !r.includes('register')
    );
  }

  /**
   * Obtiene rutas POST disponibles
   */
  getPostRoutes() {
    return this.routes.filter(r => 
      r.includes('auth') || 
      r.includes('register') || 
      r.includes('login')
    );
  }
}

module.exports = RouteDetector;
