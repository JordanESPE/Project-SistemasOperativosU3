const axios = require('axios');

class FunctionalTestRunner {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.results = [];
    this.startTime = null;
  }

  async runAllTests() {
    this.startTime = Date.now();
    console.log('[FUNCTIONAL] Starting functional tests...\n');

    await this.testHealthEndpoint();
    await this.testGetCategories();
    await this.testGetProducts();
    await this.testGetProduct();
    await this.testRegisterUser();
    await this.testLoginUser();
    await this.testAddToCart();
    await this.testCreateOrder();

    return this.generateReport();
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
      this.results.push({
        name: 'GET /api/health',
        status: 'FAILED',
        duration: 0,
        details: error.message
      });
      console.log('[FAIL] Health check: ' + error.message);
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
      this.results.push({
        name: 'GET /api/categories',
        status: 'FAILED',
        duration: 0,
        details: error.message
      });
      console.log('[FAIL] Get categories: ' + error.message);
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
      this.results.push({
        name: 'GET /api/products',
        status: 'FAILED',
        duration: 0,
        details: error.message
      });
      console.log('[FAIL] Get products: ' + error.message);
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
      this.results.push({
        name: 'GET /api/products/:id',
        status: 'FAILED',
        duration: 0,
        details: error.message
      });
      console.log('[FAIL] Get product: ' + error.message);
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
      this.results.push({
        name: 'POST /api/auth/register',
        status: 'FAILED',
        duration: 0,
        details: error.response?.data?.error || error.message
      });
      console.log('[FAIL] Register user: ' + error.message);
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
      this.results.push({
        name: 'POST /api/auth/login',
        status: 'FAILED',
        duration: 0,
        details: error.response?.data?.error || error.message
      });
      console.log('[FAIL] Login user: ' + error.message);
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
      this.results.push({
        name: 'POST /api/cart',
        status: 'FAILED',
        duration: 0,
        details: error.response?.data?.error || error.message
      });
      console.log('[FAIL] Add to cart: ' + error.message);
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
      this.results.push({
        name: 'POST /api/orders',
        status: 'FAILED',
        duration: 0,
        details: error.response?.data?.error || error.message
      });
      console.log('[FAIL] Create order: ' + error.message);
    }
  }

  generateReport() {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.status === 'PASSED').length;
    const failedTests = totalTests - passedTests;
    const duration = (Date.now() - this.startTime) / 1000;

    return {
      type: 'FUNCTIONAL_TESTS',
      timestamp: new Date().toISOString(),
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: ((passedTests / totalTests) * 100).toFixed(2) + '%',
        duration: duration.toFixed(2) + 's'
      },
      details: this.results
    };
  }
}

module.exports = FunctionalTestRunner;
