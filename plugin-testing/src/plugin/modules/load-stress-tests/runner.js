const axios = require('axios');

class LoadStressTestRunner {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.results = [];
    this.startTime = null;
  }

  async runLoadTests(duration = 10, rps = 10) {
    this.startTime = Date.now();
    console.log(`[LOAD] Starting load test (${duration}s, ${rps} RPS)...\n`);

    const endTime = this.startTime + (duration * 1000);
    let requests = 0;
    let errors = 0;
    let totalTime = 0;
    const responseTimes = [];

    while (Date.now() < endTime) {
      const promises = [];
      
      for (let i = 0; i < rps; i++) {
        promises.push(this.makeRequest().then(time => {
          requests++;
          totalTime += time;
          responseTimes.push(time);
        }).catch(() => {
          errors++;
        }));
      }

      await Promise.all(promises);
      await this.sleep(1000); // Wait 1 second between batches
    }

    return this.generateLoadReport(requests, errors, totalTime, responseTimes);
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
      await axios.get(`${this.baseUrl}/api/health`, { timeout: 5000 });
      return Date.now() - start;
    } catch (error) {
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateLoadReport(requests, errors, totalTime, responseTimes) {
    const successfulRequests = Math.max(0, requests - errors);
    const totalRequests = Math.max(requests, errors); // En caso de que requests sea 0 pero haya errores
    
    const avgTime = responseTimes.length > 0 
      ? totalTime / responseTimes.length 
      : 0;

    responseTimes.sort((a, b) => a - b);
    const p95 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0;
    const p99 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.99)] : 0;
    const maxTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const minTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const errorRate = totalRequests > 0 ? ((errors / totalRequests) * 100).toFixed(2) : '0.00';

    return {
      type: 'LOAD_TEST',
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: totalRequests,
        successfulRequests: successfulRequests,
        failedRequests: errors,
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
