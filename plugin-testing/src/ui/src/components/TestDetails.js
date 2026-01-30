import React from 'react';
import '../styles/TestDetails.css';

function TestDetails({ test }) {
  return (
    <div className="test-detail">
      <div className="test-header">
        <h4>{test.type}</h4>
      </div>
      <div className="test-body">
        {test.summary && (
          <div className="summary">
            <p><strong>Total:</strong> {test.summary.total || 0}</p>
            <p><strong>Passed:</strong> {test.summary.passed || 0}</p>
            <p><strong>Failed:</strong> {test.summary.failed || 0}</p>
            <p><strong>Success Rate:</strong> {test.summary.successRate || 'N/A'}</p>
            <p><strong>Duration:</strong> {test.summary.duration || 'N/A'}</p>
          </div>
        )}

        {test.metrics && Object.keys(test.metrics).length > 0 && (
          <div className="metrics">
            <h5>Metrics</h5>
            {Object.entries(test.metrics).map(([key, value]) => (
              <p key={key}><strong>{key}:</strong> {value}</p>
            ))}
          </div>
        )}

        {test.details && Array.isArray(test.details) && test.details.length > 0 && (
          <div className="test-list">
            <h5>Test Cases</h5>
            <ul>
              {test.details.slice(0, 5).map((detail, index) => (
                <li key={index}>
                  <span className={`status ${detail.status?.toLowerCase()}`}>{detail.status}</span>
                  {detail.name}
                </li>
              ))}
              {test.details.length > 5 && (
                <li className="more">... and {test.details.length - 5} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestDetails;
