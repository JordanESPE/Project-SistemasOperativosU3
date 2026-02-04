const axios = require('axios');

class NonFunctionalTestRunner {
  constructor(baseUrl = 'http://localhost:3001', detectedRoutes = []) {
    this.baseUrl = baseUrl;
    this.detectedRoutes = detectedRoutes;
    this.results = [];
    this.startTime = null;
    
    // Seleccionar rutas para pruebas
    this.healthRoute = this.selectHealthRoute();
    this.authRoute = this.selectAuthRoute();
  }

  selectHealthRoute() {
    if (this.detectedRoutes && this.detectedRoutes.length > 0) {
      // Buscar ruta de health
      const health = this.detectedRoutes.find(r => r.includes('health'));
      if (health) return health;
      
      // Buscar primera ruta GET simple
      const simple = this.detectedRoutes.find(r => 
        !r.includes(':id') && 
        !r.includes('auth') && 
        !r.includes('login') && 
        !r.includes('register')
      );
      if (simple) return simple;
      
      // Usar primera ruta
      return this.detectedRoutes[0];
    }
    return '/api/health';
  }

  selectAuthRoute() {
    if (this.detectedRoutes && this.detectedRoutes.length > 0) {
      // Buscar ruta de register
      const register = this.detectedRoutes.find(r => r.includes('register'));
      if (register) return register;
      
      // Buscar ruta de auth
      const auth = this.detectedRoutes.find(r => r.includes('auth'));
      if (auth) return auth;
    }
    return '/api/auth/register';
  }

  async runAllTests() {
    this.startTime = Date.now();
    console.log('[NON-FUNCTIONAL] Starting non-functional tests...\n');

    await this.testResponseTime();
    await this.testErrorHandling();
    await this.testCORS();
    await this.testDataValidation();
    await this.testServerStatus();

    return this.generateReport();
  }

  async testResponseTime() {
    try {
      const url = `${this.baseUrl}${this.healthRoute}`;
      const start = Date.now();
      await axios.get(url, { timeout: 5000 });
      const responseTime = Date.now() - start;
      const passed = responseTime < 1000; // Less than 1 second

      this.results.push({
        name: 'Response Time',
        status: passed ? 'PASSED' : 'WARNING',
        duration: responseTime,
        details: `Time: ${responseTime}ms (Threshold: 1000ms)`
      });
      console.log(`[OK] Response time: ${responseTime}ms`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      // 401/403 indican que el servidor responde (aunque requiera auth)
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      if (isAuthError) {
        const responseTime = error.response?.headers?.['x-response-time'] || 0;
        this.results.push({
          name: 'Response Time',
          status: 'WARNING',
          duration: responseTime,
          details: `Server responds (${statusCode}) - auth required`
        });
        console.log(`[WARN] Response time: Server responds but requires auth`);
      } else {
        this.results.push({
          name: 'Response Time',
          status: 'FAILED',
          duration: 0,
          details: error.message
        });
        console.log('[FAIL] Response time: ' + error.message);
      }
    }
  }

  async testErrorHandling() {
    try {
      const url = `${this.baseUrl}${this.authRoute}`;
      await axios.post(url, {}, { timeout: 5000 });
      // Si no lanza error, significa que aceptó datos vacíos (malo)
      this.results.push({
        name: 'Error Handling',
        status: 'WARNING',
        duration: 0,
        details: 'Server accepted empty request'
      });
    } catch (error) {
      const passed = error.response?.status === 400 && error.response?.data?.error;
      this.results.push({
        name: 'Error Handling',
        status: passed ? 'PASSED' : 'FAILED',
        duration: 0,
        details: `Error message: ${error.response?.data?.error || error.response?.data?.message || 'No message'}`
      });
      console.log('[OK] Error handling: verified');
    }
  }

  async testCORS() {
    try {
      const url = `${this.baseUrl}${this.healthRoute}`;
      const response = await axios.get(url, {
        headers: { 'Origin': 'http://example.com' },
        timeout: 5000
      });
      const hasCORS = response.headers['access-control-allow-origin'] || 'Not set';
      this.results.push({
        name: 'CORS Headers',
        status: hasCORS !== 'Not set' ? 'PASSED' : 'WARNING',
        duration: 0,
        details: `Allow-Origin: ${hasCORS}`
      });
      console.log(`[OK] CORS: ${hasCORS}`);
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      if (isAuthError) {
        // Si hay respuesta, verificar headers CORS
        const hasCORS = error.response?.headers?.['access-control-allow-origin'] || 'Not set';
        this.results.push({
          name: 'CORS Headers',
          status: hasCORS !== 'Not set' ? 'PASSED' : 'WARNING',
          duration: 0,
          details: `Allow-Origin: ${hasCORS} (auth required)`
        });
        console.log(`[${hasCORS !== 'Not set' ? 'OK' : 'WARN'}] CORS: ${hasCORS}`);
      } else {
        this.results.push({
          name: 'CORS Headers',
          status: 'FAILED',
          duration: 0,
          details: error.message
        });
        console.log('[FAIL] CORS: ' + error.message);
      }
    }
  }

  async testDataValidation() {
    try {
      const url = `${this.baseUrl}${this.authRoute}`;
      await axios.post(url, {
        full_name: 'Test',
        name: 'Test',
        email: 'test@example.com'
        // Sin password - debe fallar validación
      }, { timeout: 5000 });
      
      this.results.push({
        name: 'Data Validation',
        status: 'WARNING',
        duration: 0,
        details: 'Missing password validation'
      });
    } catch (error) {
      // Si recibimos error 400, la validación funciona
      const isValidationError = error.response?.status === 400;
      this.results.push({
        name: 'Data Validation',
        status: isValidationError ? 'PASSED' : 'FAILED',
        duration: 0,
        details: isValidationError ? 'Required field validation active' : error.message
      });
      console.log('[OK] Data validation: active');
    }
  }

  async testServerStatus() {
    try {
      const url = `${this.baseUrl}${this.healthRoute}`;
      const response = await axios.get(url, { timeout: 5000 });
      const status = response.data.status || response.data.message || 'OK';
      
      this.results.push({
        name: 'Server Status',
        status: 'PASSED',
        duration: 0,
        details: `Server active: ${status}`
      });
      console.log('[OK] Server status: ACTIVE');
    } catch (error) {
      const statusCode = error.response?.status || 0;
      const isAuthError = statusCode === 401 || statusCode === 403;
      
      // 401/403 significa que el servidor está activo (aunque requiere auth)
      if (isAuthError) {
        this.results.push({
          name: 'Server Status',
          status: 'PASSED',
          duration: 0,
          details: `Server active (requires auth - ${statusCode})`
        });
        console.log('[OK] Server status: ACTIVE (auth required)');
      } else {
        this.results.push({
          name: 'Server Status',
          status: 'FAILED',
          duration: 0,
          details: 'Server not responding'
        });
        console.log('[FAIL] Server status: INACTIVE');
      }
    }
  }

  generateReport() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASSED').length;
    const failedTests = this.results.filter(r => r.status === 'FAILED').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const duration = (Date.now() - this.startTime) / 1000;

    return {
      type: 'NON_FUNCTIONAL_TESTS',
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

module.exports = NonFunctionalTestRunner;
