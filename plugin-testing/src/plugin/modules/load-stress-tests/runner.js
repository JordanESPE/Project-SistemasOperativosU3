const axios = require('axios');

class LoadStressTestRunner {
  constructor(baseUrl = 'http://localhost:3001', detectedRoutes = []) {
    this.baseUrl = baseUrl;
    this.results = [];
    this.startTime = null;
    
    // Usar la primera ruta detectada, o fallback a rutas por defecto
    this.testRoute = this.selectTestRoute(detectedRoutes);
    console.log(`[LOAD/STRESS] Using test route: ${this.testRoute}`);
  }
  
  selectTestRoute(routes) {
    if (!routes || routes.length === 0) {
      return '/api/health'; // Fallback
    }
    
    // 1. PRIORIDAD: Buscar /api/health primero (es la ruta más confiable)
    const healthRoute = routes.find(r => r === '/api/health' || r === '/health');
    if (healthRoute) {
      console.log(`[LOAD/STRESS] Using health check route: ${healthRoute}`);
      return healthRoute;
    }
    
    // 2. Buscar rutas de solo lectura (GET típicas: products, categories, stats)
    const readOnlyRoutes = routes.filter(r => 
      r.startsWith('/api/') && 
      !r.includes(':id') && 
      !r.includes('auth') &&
      !r.includes('login') &&
      !r.includes('register') &&
      !r.includes('cart') &&  // Cart suele requerir user_id
      !r.includes('orders') && // Orders suele requerir auth
      !r.includes('users')     // Users suele requerir auth
    );
    
    if (readOnlyRoutes.length > 0) {
      console.log(`[LOAD/STRESS] Found ${readOnlyRoutes.length} read-only routes: ${readOnlyRoutes.join(', ')}`);
      return readOnlyRoutes[0];
    }
    
    // 3. Cualquier ruta API sin parámetros
    const apiRoutes = routes.filter(r => 
      r.startsWith('/api/') && 
      !r.includes(':id') && 
      !r.includes('auth') &&
      !r.includes('login') &&
      !r.includes('register')
    );
    
    if (apiRoutes.length > 0) {
      console.log(`[LOAD/STRESS] Found ${apiRoutes.length} API routes: ${apiRoutes.join(', ')}`);
      return apiRoutes[0];
    }
    
    // 4. Como último recurso, usar la primera ruta disponible
    console.log(`[LOAD/STRESS] Using fallback route: ${routes[0]}`);
    return routes[0];
  }

  async runLoadTests(duration = 10, rps = 10) {
    this.startTime = Date.now();
    console.log(`[LOAD] Starting load test (${duration}s, ${rps} RPS)...\n`);

    const endTime = this.startTime + (duration * 1000);
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalTime = 0;
    const responseTimes = [];

    while (Date.now() < endTime) {
      const promises = [];
      
      for (let i = 0; i < rps; i++) {
        promises.push(this.makeRequest().then(time => {
          successfulRequests++;
          totalTime += time;
          responseTimes.push(time);
        }).catch(() => {
          failedRequests++;
        }));
      }

      await Promise.all(promises);
      await this.sleep(1000); // Wait 1 second between batches
    }

    return this.generateLoadReport(successfulRequests, failedRequests, totalTime, responseTimes);
  }

  async runStressTests(maxLoad = 100, increment = 10) {
    this.startTime = Date.now();
    console.log(`[STRESS] Starting stress test (max load: ${maxLoad})...\n`);

    let currentLoad = increment;
    let results = [];
    let maxReached = false;

    while (currentLoad <= maxLoad && !maxReached) {
      console.log(`Testing with ${currentLoad} concurrent requests...`);
      const result = await this.stressTestAtLoad(currentLoad);
      results.push(result);

      if (result.errorRate > 30) {
        console.warn(`[WARN] High error rate (${result.errorRate}%). Stopping.`);
        maxReached = true;
      }

      currentLoad += increment;
    }

    return this.generateStressReport(results, maxReached);
  }

  async stressTestAtLoad(concurrentRequests) {
    const promises = [];
    let errors = 0;
    const responseTimes = [];

    for (let i = 0; i < concurrentRequests; i++) {
      promises.push(
        this.makeRequest()
          .then(time => responseTimes.push(time))
          .catch(() => errors++)
      );
    }

    await Promise.all(promises);

    const avgTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    return {
      concurrentRequests,
      successful: responseTimes.length,
      failed: errors,
      errorRate: ((errors / (responseTimes.length + errors)) * 100).toFixed(2),
      avgResponseTime: avgTime.toFixed(2),
      maxResponseTime: Math.max(...responseTimes),
      minResponseTime: Math.min(...responseTimes)
    };
  }

  async makeRequest() {
    const start = Date.now();
    try {
      const url = `${this.baseUrl}${this.testRoute}`;
      const response = await axios.get(url, { timeout: 5000 });
      const duration = Date.now() - start;
      console.log(`[LOAD] ✓ ${url} - ${response.status} - ${duration}ms`);
      return duration;
    } catch (error) {
      const duration = Date.now() - start;
      const statusCode = error.response?.status || 0;
      
      // 401/403/404 indican que el servidor está respondiendo (endpoint existe o requiere auth)
      // Los consideramos como "exitosos" para medición de carga
      if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
        console.log(`[LOAD] ~ ${this.baseUrl}${this.testRoute} - ${statusCode} (auth/not-found) - ${duration}ms`);
        return duration;
      }
      
      console.log(`[LOAD] ✗ ${this.baseUrl}${this.testRoute} - ${error.message} - ${duration}ms`);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateLoadReport(successfulRequests, failedRequests, totalTime, responseTimes) {
    const totalRequests = successfulRequests + failedRequests;
    const errorRate = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(2) : '0.00';
    
    const avgTime = responseTimes.length > 0 
      ? totalTime / responseTimes.length 
      : 0;

    responseTimes.sort((a, b) => a - b);
    const p95 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0;
    const p99 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.99)] : 0;
    const maxTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const minTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;

    return {
      type: 'LOAD_TEST',
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: totalRequests,
        successfulRequests: successfulRequests,
        failedRequests: failedRequests,
        errorRate: errorRate + '%',
        duration: ((Date.now() - this.startTime) / 1000).toFixed(2) + 's'
      },
      metrics: {
        avgResponseTime: avgTime.toFixed(2) + 'ms',
        maxResponseTime: maxTime.toFixed(2) + 'ms',
        minResponseTime: minTime > 0 ? minTime.toFixed(2) + 'ms' : '0.00ms',
        p95: p95 > 0 ? p95.toFixed(2) + 'ms' : '0.00ms',
        p99: p99 > 0 ? p99.toFixed(2) + 'ms' : '0.00ms',
        requestsPerSecond: totalRequests > 0 ? (totalRequests / ((Date.now() - this.startTime) / 1000)).toFixed(2) : '0.00'
      }
    };
  }

  generateStressReport(results, maxReached) {
    const duration = (Date.now() - this.startTime) / 1000;

    return {
      type: 'STRESS_TEST',
      timestamp: new Date().toISOString(),
      summary: {
        maxConcurrentRequests: results[results.length - 1]?.concurrentRequests || 0,
        systemLimitReached: maxReached,
        duration: duration.toFixed(2) + 's'
      },
      scalabilityMetrics: results,
      analysis: {
        breakPoint: maxReached 
          ? `Fallo detectado a ${results[results.length - 1]?.concurrentRequests} requests simultáneos`
          : 'Sistema resistió toda la carga de prueba',
        maxErrorRate: Math.max(...results.map(r => parseFloat(r.errorRate))).toFixed(2) + '%',
        averageLatency: (results.reduce((sum, r) => sum + parseFloat(r.avgResponseTime), 0) / results.length).toFixed(2) + 'ms'
      }
    };
  }
}

module.exports = LoadStressTestRunner;
