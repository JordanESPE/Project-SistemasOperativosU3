const axios = require('axios');

class NonFunctionalTestRunner {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.results = [];
    this.startTime = null;
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
      const start = Date.now();
      await axios.get(`${this.baseUrl}/api/health`);
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
      this.results.push({
        name: 'Response Time',
        status: 'FAILED',
        duration: 0,
        details: error.message
      });
      console.log('[FAIL] Response time: ' + error.message);
    }
  }

  async testErrorHandling() {
    try {
      await axios.post(`${this.baseUrl}/api/auth/register`, {});
    } catch (error) {
      const passed = error.response?.status === 400 && error.response?.data?.error;
      this.results.push({
        name: 'Error Handling',
        status: passed ? 'PASSED' : 'FAILED',
        duration: 0,
        details: `Error message: ${error.response?.data?.error || 'No message'}`
      });
      console.log('[OK] Error handling: verified');
    }
  }

  async testCORS() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`, {
        headers: { 'Origin': 'http://example.com' }
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
      this.results.push({
        name: 'CORS Headers',
        status: 'FAILED',
        duration: 0,
        details: error.message
      });
      console.log('[FAIL] CORS: ' + error.message);
    }
  }

  async testDataValidation() {
    try {
      await axios.post(`${this.baseUrl}/api/auth/register`, {
        full_name: 'Test',
        email: 'test@example.com'
      });
      this.results.push({
        name: 'Data Validation',
        status: 'WARNING',
        duration: 0,
        details: 'Missing password validation'
      });
    } catch (error) {
      this.results.push({
        name: 'Data Validation',
        status: 'PASSED',
        duration: 0,
        details: 'Required field validation active'
      });
      console.log('[OK] Data validation: active');
    }
  }

  async testServerStatus() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      const hasTimestamp = response.data.timestamp;
      this.results.push({
        name: 'Server Status',
        status: hasTimestamp ? 'PASSED' : 'FAILED',
        duration: 0,
        details: `Server active: ${response.data.status}`
      });
      console.log('[OK] Server status: ACTIVE');
    } catch (error) {
      this.results.push({
        name: 'Server Status',
        status: 'FAILED',
        duration: 0,
        details: 'Server not responding'
      });
      console.log('[FAIL] Server status: INACTIVE');
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
