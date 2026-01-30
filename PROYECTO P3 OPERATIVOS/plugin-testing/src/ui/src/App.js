import React, { useState, useEffect } from 'react';
import ReportViewer from './components/ReportViewer';
import './App.css';

function App() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  useEffect(() => {
    loadLatestReport();
    const interval = setInterval(loadLatestReport, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadLatestReport = async () => {
    try {
      const response = await fetch('http://localhost:3002/api/latest-report');
      if (!response.ok) throw new Error('Failed to load report');
      const data = await response.json();
      
      if (data.summary || data.details) {
        setReportData(data);
        setError(null);
      }
    } catch (err) {
      if (loading) {
        setError('Waiting for tests to run...');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!reportData) return;
    
    try {
      const response = await fetch('http://localhost:3002/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `test-report-${new Date().getTime()}.pdf`;
        link.click();
      }
    } catch (err) {
      console.error('Error exporting PDF:', err);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1>⚡ Testing Plugin</h1>
            <p>Visual Report Viewer & Analyzer</p>
          </div>
          {reportData && (
            <div className="header-stats">
              <div className="stat-badge">
                <span className="stat-label">Tests</span>
                <span className="stat-value">{reportData.summary?.overall?.totalTests || 0}</span>
              </div>
              <div className="stat-badge success">
                <span className="stat-label">Passed</span>
                <span className="stat-value">{reportData.summary?.overall?.totalPassed || 0}</span>
              </div>
              <div className="stat-badge danger">
                <span className="stat-label">Failed</span>
                <span className="stat-value">{reportData.summary?.overall?.totalFailed || 0}</span>
              </div>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button className="btn btn-refresh" onClick={loadLatestReport} disabled={testRunning}>
            🔄 Refresh
          </button>
          <button className="btn btn-export" onClick={handleExportPDF} disabled={!reportData || testRunning}>
            📥 Export PDF
          </button>
        </div>
      </header>

      <main className="app-main">
        {loading && !reportData ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading reports...</p>
          </div>
        ) : error && !reportData ? (
          <div className="status-message waiting">
            <div className="pulse"></div>
            <h2>{error}</h2>
            <p>The application is waiting for test execution to complete...</p>
          </div>
        ) : reportData ? (
          <ReportViewer data={reportData} />
        ) : (
          <div className="status-message empty">
            <h2>No Reports Available</h2>
            <p>Run tests to generate reports</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
