const FunctionalTestRunner = require('../modules/functional-tests/runner');
const NonFunctionalTestRunner = require('../modules/non-functional-tests/runner');
const LoadStressTestRunner = require('../modules/load-stress-tests/runner');
const ReportGenerator = require('../modules/report-generator/generator');

class TestExecutor {
  constructor(baseUrl = 'http://localhost:3001', detectedRoutes = []) {
    this.baseUrl = baseUrl;
    this.detectedRoutes = detectedRoutes;
    this.allResults = [];
  }

  async executeAll() {
    console.log('\n========================================================================');
    console.log('             COMPLETE TEST SUITE                                       ');
    console.log('========================================================================\n');

    try {
      // Functional tests
      const functionalRunner = new FunctionalTestRunner(this.baseUrl, this.detectedRoutes);
      const functionalResults = await functionalRunner.runAllTests();
      this.allResults.push(functionalResults);
      console.log('\n[OK] Functional tests completed\n');

      // Non-functional tests
      const nonFunctionalRunner = new NonFunctionalTestRunner(this.baseUrl, this.detectedRoutes);
      const nonFunctionalResults = await nonFunctionalRunner.runAllTests();
      this.allResults.push(nonFunctionalResults);
      console.log('\n[OK] Non-functional tests completed\n');

      // Load tests
      const loadStressRunner = new LoadStressTestRunner(this.baseUrl, this.detectedRoutes);
      const loadResults = await loadStressRunner.runLoadTests(5, 5);
      this.allResults.push(loadResults);
      console.log('\n[OK] Load test completed\n');

      // Stress tests
      const stressResults = await loadStressRunner.runStressTests(50, 10);
      this.allResults.push(stressResults);
      console.log('\n[OK] Stress test completed\n');

      // Generate report
      const reportGenerator = new ReportGenerator();
      const reportPath = await reportGenerator.generateReport(this.allResults);
      console.log(`\n[REPORT] Generated: ${reportPath}\n`);

      return {
        success: true,
        results: this.allResults,
        reportPath: reportPath
      };
    } catch (error) {
      console.error('[ERROR] Execution error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async executeFunctional() {
    console.log('\n========================================================================');
    console.log('             FUNCTIONAL TESTS                                          ');
    console.log('========================================================================\n');

    try {
      const runner = new FunctionalTestRunner(this.baseUrl, this.detectedRoutes);
      const results = await runner.runAllTests();
      this.allResults.push(results);

      const reportGenerator = new ReportGenerator();
      const reportPath = await reportGenerator.generateReport(this.allResults);
      console.log(`\n[REPORT] Generated: ${reportPath}\n`);

      return { success: true, results, reportPath };
    } catch (error) {
      console.error('[ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }

  async executeNonFunctional() {
    console.log('\n========================================================================');
    console.log('             NON-FUNCTIONAL TESTS                                      ');
    console.log('========================================================================\n');

    try {
      const runner = new NonFunctionalTestRunner(this.baseUrl, this.detectedRoutes);
      const results = await runner.runAllTests();
      this.allResults.push(results);

      const reportGenerator = new ReportGenerator();
      const reportPath = await reportGenerator.generateReport(this.allResults);
      console.log(`\n[REPORT] Generated: ${reportPath}\n`);

      return { success: true, results, reportPath };
    } catch (error) {
      console.error('[ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }

  async executeLoad() {
    console.log('\n========================================================================');
    console.log('             LOAD TEST                                                 ');
    console.log('========================================================================\n');

    try {
      const runner = new LoadStressTestRunner(this.baseUrl, this.detectedRoutes);
      const results = await runner.runLoadTests(10, 5);
      this.allResults.push(results);

      const reportGenerator = new ReportGenerator();
      const reportPath = await reportGenerator.generateReport(this.allResults);
      console.log(`\n[REPORT] Generated: ${reportPath}\n`);

      return { success: true, results, reportPath };
    } catch (error) {
      console.error('[ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }

  async executeStress() {
    console.log('\n========================================================================');
    console.log('             STRESS TEST                                               ');
    console.log('========================================================================\n');

    try {
      const runner = new LoadStressTestRunner(this.baseUrl, this.detectedRoutes);
      const results = await runner.runStressTests(100, 20);
      this.allResults.push(results);

      const reportGenerator = new ReportGenerator();
      const reportPath = await reportGenerator.generateReport(this.allResults);
      console.log(`\n[REPORT] Generated: ${reportPath}\n`);

      return { success: true, results, reportPath };
    } catch (error) {
      console.error('[ERROR]', error.message);
      return { success: false, error: error.message };
    }
  }

  async generateReport() {
    console.log('\n========================================================================');
    console.log('             GENERATING REPORT                                         ');
    console.log('========================================================================\n');

    if (this.allResults.length === 0) {
      console.log('[WARN] No results to generate report. Run tests first.\n');
      return { success: false, error: 'No results' };
    }

    try {
      const reportGenerator = new ReportGenerator();
      const reportPath = await reportGenerator.generateReport(this.allResults);
      console.log(`[OK] Report generated: ${reportPath}\n`);
      return { success: true, reportPath };
    } catch (error) {
      console.error('[ERROR] Report generation error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = TestExecutor;
