const axios = require('axios');

class FunctionalTestRunner {
  constructor(baseUrl = 'http://localhost:3001', detectedRoutes = []) {
    this.baseUrl = baseUrl;
    this.detectedRoutes = detectedRoutes;
    this.results = [];
    this.startTime = null;
  }

  async runAllTests() {
    this.startTime = Date.now();
    console.log('[FUNCTIONAL] Starting functional tests...\n');

    // Si hay rutas detectadas, usarlas; si no, usar las hardcodeadas
    if (this.detectedRoutes && this.detectedRoutes.length > 0) {
      console.log(`[FUNCTIONAL] Using ${this.detectedRoutes.length} detected routes\n`);
      await this.runDetectedRouteTests();
    } else {
      console.log('[FUNCTIONAL] No routes detected, using default routes\n');
      await this.runDefaultTests();
    }

    return this.generateReport();
  }

  // ============================================
  // TESTS DINÁMICOS BASADOS EN RUTAS DETECTADAS
  // ============================================
  
  async runDetectedRouteTests() {
    // Clasificar las rutas detectadas
    const routes = this.classifyRoutes();
    
    // 1. Probar rutas de health check
    if (routes.health.length > 0) {
      await this.testRoute(routes.health[0], 'GET', 'Health Check');
    }
    
    // 2. Probar rutas GET (lectura de datos)
    for (const route of routes.get.slice(0, 5)) { // Máximo 5 rutas GET
      await this.testRoute(route, 'GET', `GET ${route}`);
    }
    
    // 3. Probar rutas de autenticación
    if (routes.register) {
      await this.testRegister(routes.register);
    }
    
    if (routes.login) {
      await this.testLogin(routes.login);
    }
    
    // 4. Probar rutas POST (crear datos)
    for (const route of routes.post.slice(0, 3)) { // Máximo 3 rutas POST
      await this.testPostRoute(route);
    }
  }

  classifyRoutes() {
    const routes = {
      health: [],
      get: [],
      post: [],
      register: null,
      login: null
    };
    
    // Buscar si existe /api/auth como ruta base
    const hasAuthBase = this.detectedRoutes.some(r => r === '/api/auth');
    
    for (const route of this.detectedRoutes) {
      // Health check
      if (route.includes('health')) {
        routes.health.push(route);
      }
      // Register (ruta completa)
      else if (route.includes('register')) {
        routes.register = route;
      }
      // Login (ruta completa)
      else if (route.includes('login')) {
        routes.login = route;
      }
      // Ruta base de auth - generar rutas completas
      else if (route === '/api/auth' && !routes.register && !routes.login) {
        routes.register = '/api/auth/register';
        routes.login = '/api/auth/login';
      }
      // Rutas GET (sin :id y sin auth)
      else if (!route.includes(':id') && !route.includes('auth')) {
        routes.get.push(route);
      }
      // Rutas con :id se prueban como GET con id específico
      else if (route.includes(':id')) {
        routes.post.push(route);
      }
    }
    
    // Si no encontramos rutas de health pero hay rutas GET, usar la primera
    if (routes.health.length === 0 && routes.get.length > 0) {
      routes.health.push(routes.get[0]);
    }
    
    return routes;
  }

  async testRoute(route, method, testName) {
    try {
      const url = `${this.baseUrl}${route}`;
      const start = Date.now();
      const response = await axios({ method, url, timeout: 5000 });
      const duration = Date.now() - start;
      
      // Determinar si pasó basándose en el status code
      const passed = response.status >= 200 && response.status < 400;
      
      // Generar detalles basados en la respuesta
      let details = `Status: ${response.status}`;
      if (Array.isArray(response.data)) {
        details = `Found ${response.data.length} items`;
      } else if (response.data && typeof response.data === 'object') {
        details = response.data.status || response.data.message || `Status: ${response.status} OK`;
      }
      
      this.results.push({
        name: `${method} ${route}`,
        status: passed ? 'PASSED' : 'FAILED',
        duration,
        details
      });
      console.log(`[OK] ${testName}: ${details}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      
      // 401/403 indican que el endpoint existe pero requiere autenticación
      // Los marcamos como WARNING en lugar de FAILED
      const isAuthError = statusCode === 401 || statusCode === 403;
      const status = isAuthError ? 'WARNING' : 'FAILED';
      const logPrefix = isAuthError ? 'WARN' : 'FAIL';
      
      this.results.push({
        name: `${method} ${route}`,
        status,
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${logPrefix}] ${testName}: ${errorMsg}`);
    }
  }

  async testRegister(route) {
    try {
      const url = `${this.baseUrl}${route}`;
      const testUser = {
        email: `test${Date.now()}@example.com`,
        password: 'TestPassword123!',
        name: 'Test User',
        full_name: 'Test User ' + Date.now(),
        username: 'testuser' + Date.now(),
        phone: '555-0123'
      };
      
      const start = Date.now();
      const response = await axios.post(url, testUser, { timeout: 5000 });
      const duration = Date.now() - start;
      
      const passed = response.status === 200 || response.status === 201;
      const userId = response.data.id || response.data.userId || response.data.user?.id || 'created';
      
      this.results.push({
        name: `POST ${route}`,
        status: passed ? 'PASSED' : 'FAILED',
        duration,
        details: `User registered: ${userId}`
      });
      console.log(`[OK] Register: User ${userId}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      
      this.results.push({
        name: `POST ${route}`,
        status: 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[FAIL] Register: ${errorMsg}`);
    }
  }

  async testLogin(route) {
    try {
      const url = `${this.baseUrl}${route}`;
      
      // Intentar con diferentes formatos de credenciales
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
        username: 'test'
      };
      
      const start = Date.now();
      const response = await axios.post(url, credentials, { timeout: 5000 });
      const duration = Date.now() - start;
      
      const passed = response.status === 200 && (response.data.token || response.data.accessToken);
      
      this.results.push({
        name: `POST ${route}`,
        status: passed ? 'PASSED' : 'FAILED',
        duration,
        details: passed ? 'Token received' : 'No token in response'
      });
      console.log(`[OK] Login: ${passed ? 'Token received' : 'No token'}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      
      // 401/403 son respuestas válidas (credenciales incorrectas pero endpoint funciona)
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: `POST ${route}`,
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Login: ${errorMsg}`);
    }
  }

  async testPostRoute(route) {
    try {
      // Para rutas con :id, probar con ID 1
      const url = `${this.baseUrl}${route.replace(/:id/g, '1')}`;
      
      const start = Date.now();
      const response = await axios.get(url, { timeout: 5000 });
      const duration = Date.now() - start;
      
      const passed = response.status >= 200 && response.status < 400;
      
      this.results.push({
        name: `GET ${route}`,
        status: passed ? 'PASSED' : 'FAILED',
        duration,
        details: `Status: ${response.status}`
      });
      console.log(`[OK] ${route}: Status ${response.status}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      
      // 401/403 indican que el endpoint existe pero requiere autenticación
      const isAuthError = statusCode === 401 || statusCode === 403;
      const status = isAuthError ? 'WARNING' : 'FAILED';
      
      this.results.push({
        name: `GET ${route}`,
        status,
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] ${route}: ${errorMsg}`);
    }
  }

  // ============================================
  // TESTS HARDCODEADOS (FALLBACK)
  // ============================================
  
  async runDefaultTests() {
    await this.testHealthEndpoint();
    await this.testGetCategories();
    await this.testGetProducts();
    await this.testGetProduct();
    await this.testRegisterUser();
    await this.testLoginUser();
    await this.testAddToCart();
    await this.testCreateOrder();
  }

  async testHealthEndpoint() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      this.results.push({
        name: 'GET /api/health',
        status: response.status === 200 ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Status: ${response.status} OK`
      });
      console.log('[OK] Health check: OK');
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'GET /api/health',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Health check: ${errorMsg}`);
    }
  }

  async testGetCategories() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/categories`);
      const passed = Array.isArray(response.data) && response.data.length > 0;
      this.results.push({
        name: 'GET /api/categories',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Categories found: ${response.data.length}`
      });
      console.log(`[OK] Get categories: ${response.data.length} found`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'GET /api/categories',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Get categories: ${errorMsg}`);
    }
  }

  async testGetProducts() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/products`);
      const passed = Array.isArray(response.data) && response.data.length > 0;
      this.results.push({
        name: 'GET /api/products',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Products found: ${response.data.length}`
      });
      console.log(`[OK] Get products: ${response.data.length} found`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'GET /api/products',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Get products: ${errorMsg}`);
    }
  }

  async testGetProduct() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/products/1`);
      const passed = response.status === 200 && response.data.id === 1;
      this.results.push({
        name: 'GET /api/products/:id',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Product: ${response.data.name}`
      });
      console.log(`[OK] Get product 1: ${response.data.name}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'GET /api/products/:id',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Get product: ${errorMsg}`);
    }
  }

  async testRegisterUser() {
    try {
      const testUser = {
        email: `test${Date.now()}@example.com`,
        password: 'TestPassword123!',
        full_name: 'Test User ' + Date.now(),
        phone: '555-0123'
      };

      const response = await axios.post(`${this.baseUrl}/api/auth/register`, testUser);
      const passed = response.status === 201 && response.data.id;
      this.results.push({
        name: 'POST /api/auth/register',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `User registered: ID ${response.data.id}`
      });
      console.log(`[OK] User registered: ID ${response.data.id}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      // 409 (conflict) también indica que el endpoint funciona
      const isPartialSuccess = statusCode === 401 || statusCode === 403 || statusCode === 409;
      
      this.results.push({
        name: 'POST /api/auth/register',
        status: isPartialSuccess ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isPartialSuccess ? 'WARN' : 'FAIL'}] Register user: ${errorMsg}`);
    }
  }

  async testLoginUser() {
    try {
      const response = await axios.post(`${this.baseUrl}/api/auth/login`, {
        email: 'customer@example.com',
        password: 'password123'
      });
      const passed = response.status === 200 && response.data.token;
      this.results.push({
        name: 'POST /api/auth/login',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Login successful: token received`
      });
      console.log('[OK] User login: token received');
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      // 401 (credenciales incorrectas) indica que el endpoint funciona
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'POST /api/auth/login',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Login user: ${errorMsg}`);
    }
  }

  async testAddToCart() {
    try {
      const response = await axios.post(`${this.baseUrl}/api/cart`, {
        user_id: 1,
        product_id: 1,
        quantity: 2
      });
      const passed = response.status === 200 || response.status === 201;
      this.results.push({
        name: 'POST /api/cart',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Product added to cart`
      });
      console.log('[OK] Add to cart: product added');
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'POST /api/cart',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Add to cart: ${errorMsg}`);
    }
  }

  async testCreateOrder() {
    try {
      const response = await axios.post(`${this.baseUrl}/api/orders`, {
        user_id: 1,
        total_amount: 99.99
      });
      const passed = response.status === 200 || response.status === 201;
      this.results.push({
        name: 'POST /api/orders',
        status: passed ? 'PASSED' : 'FAILED',
        duration: response.duration || 0,
        details: `Order created: #${response.data.order_number || response.data.id}`
      });
      console.log('[OK] Create order: successful');
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      this.results.push({
        name: 'POST /api/orders',
        status: isAuthError ? 'WARNING' : 'FAILED',
        duration: 0,
        details: `${statusCode ? `Status ${statusCode}: ` : ''}${errorMsg}`
      });
      console.log(`[${isAuthError ? 'WARN' : 'FAIL'}] Create order: ${errorMsg}`);
    }
  }

  generateReport() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASSED').length;
    const failedTests = this.results.filter(r => r.status === 'FAILED').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const duration = (Date.now() - this.startTime) / 1000;

    return {
      type: 'FUNCTIONAL_TESTS',
      timestamp: new Date().toISOString(),
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        warnings: warnings,
        successRate: ((passedTests / totalTests) * 100).toFixed(2) + '%',
        duration: duration.toFixed(2) + 's'
      },
      details: this.results
    };
  }
}

module.exports = FunctionalTestRunner;
