import React from 'react';
import '../styles/TestDetails.css';

function TestDetails({ test }) {
  // Determinar qué campos mostrar según el tipo de prueba
  const getSummaryData = () => {
    if (!test.summary) return null;

    if (test.type === 'LOAD_TEST') {
      const errorRate = parseFloat(test.summary.errorRate) || 0;
      const successRate = (100 - errorRate).toFixed(2) + '%';
      
      return {
        total: test.summary.totalRequests || 0,
        passed: test.summary.successfulRequests || 0,
        failed: test.summary.failedRequests || 0,
        successRate: successRate,
        duration: test.summary.duration || 'N/A'
      };
    } else if (test.type === 'STRESS_TEST') {
      return {
        total: test.summary.maxConcurrentRequests || 0,
        passed: test.summary.systemLimitReached ? 0 : test.summary.maxConcurrentRequests || 0,
        failed: test.summary.systemLimitReached ? test.summary.maxConcurrentRequests || 0 : 0,
        successRate: test.summary.systemLimitReached ? '0%' : '100%',
        duration: test.summary.duration || 'N/A'
      };
    } else {
      // FUNCTIONAL_TESTS y NON_FUNCTIONAL_TESTS
      return {
        total: test.summary.total || 0,
        passed: test.summary.passed || 0,
        failed: test.summary.failed || 0,
        successRate: test.summary.successRate || 'N/A',
        duration: test.summary.duration || 'N/A'
      };
    }
  };

  const summaryData = getSummaryData();

  return (
    <div className="test-detail">
      <div className="test-header">
        <h4>{test.type}</h4>
      </div>
      <div className="test-body">
        {summaryData && (
          <div className="summary">
            <p><strong>Total:</strong> {summaryData.total}</p>
            <p><strong>Passed:</strong> {summaryData.passed}</p>
            <p><strong>Failed:</strong> {summaryData.failed}</p>
            <p><strong>Success Rate:</strong> {summaryData.successRate}</p>
            <p><strong>Duration:</strong> {summaryData.duration}</p>
          </div>
        )}

        {test.metrics && Object.keys(test.metrics).length > 0 && (
          <div className="metrics">
            <h5>METRICS</h5>
            {Object.entries(test.metrics).map(([key, value]) => (
              <p key={key}><strong>{key}:</strong> {value}</p>
            ))}
          </div>
        )}

        {test.details && Array.isArray(test.details) && test.details.length > 0 && (
          <div className="test-list">
            <h5>Test Cases</h5>
            <ul>
              {test.details.map((detail, index) => (
                <li key={index}>
                  <span className={`status ${detail.status?.toLowerCase()}`}>{detail.status}</span>
                  {detail.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestDetails;
