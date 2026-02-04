import React from 'react';
import '../styles/SummaryCards.css';

function SummaryCards({ data }) {
  if (!data || !data.tests) return <div>No summary data</div>;

  return (
    <div className="summary-cards">
      {data.tests.map((test, index) => (
        <div key={index} className="card">
          <h3>{test.type.replace(/_/g, ' ')}</h3>
          <div className="card-content">
            <div className="stat">
              <span className="label">Result:</span>
              <span className="value">{test.status}</span>
            </div>
            <div className="stat">
              <span className="label">Success Rate:</span>
              <span className="value success">{test.successRate}</span>
            </div>
            <div className="stat">
              <span className="label">Duration:</span>
              <span className="value">{test.duration}</span>
            </div>
          </div>
        </div>
      ))}

      {data.overall && (
        <div className="card overall-card">
          <h3>Overall Results</h3>
          <div className="card-content">
            <div className="stat">
              <span className="label">Total Tests:</span>
              <span className="value">{data.overall.totalTests}</span>
            </div>
            <div className="stat">
              <span className="label">Passed:</span>
              <span className="value passed">{data.overall.totalPassed}</span>
            </div>
            <div className="stat">
              <span className="label">Failed:</span>
              <span className="value failed">{data.overall.totalFailed}</span>
            </div>
            {data.overall.totalWarnings > 0 && (
              <div className="stat">
                <span className="label">Warnings:</span>
                <span className="value warning">{data.overall.totalWarnings}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SummaryCards;
