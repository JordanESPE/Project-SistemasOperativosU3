import React from 'react';
import SummaryCards from './SummaryCards';
import TestDetails from './TestDetails';
import '../styles/ReportViewer.css';

function ReportViewer({ data }) {
  if (!data) return <div>No data</div>;

  return (
    <div className="report-viewer">
      <section className="summary-section">
        <h2>Summary</h2>
        <SummaryCards data={data.summary} />
      </section>

      <section className="details-section">
        <h2>Test Details</h2>
        {data.details && Array.isArray(data.details) && (
          <div className="details-grid">
            {data.details.map((test, index) => (
              <TestDetails key={index} test={test} />
            ))}
          </div>
        )}
      </section>

      <section className="metadata-section">
        <p className="timestamp">Generated: {data.generatedAt}</p>
      </section>
    </div>
  );
}

export default ReportViewer;
