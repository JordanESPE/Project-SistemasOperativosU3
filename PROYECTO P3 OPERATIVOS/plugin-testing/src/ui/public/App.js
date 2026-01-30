import React, { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './App.css';

function App() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const getChartData = () => {
    if (!reportData?.summary?.tests) return [];
    return reportData.summary.tests.map(test => {
      const parts = test.status.split('/');
      return {
        name: test.type.replace(/_/g, ' '),
        passed: parseInt(parts[0]) || 0,
        failed: parseInt(parts[1]) - parseInt(parts[0]) || 0
      };
    });
  };

  const getStatusData = () => {
    if (!reportData?.summary?.overall) return [];
    const overall = reportData.summary.overall;
    return [
      { name: 'Passed', value: overall.totalPassed, fill: '#10b981' },
      { name: 'Failed', value: overall.totalFailed, fill: '#ef4444' }
    ];
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon">⚡</div>
            <div>
              <h1>Testing Plugin</h1>
              <p>Professional Test Report Analyzer</p>
            </div>
          </div>
          
          {reportData && (
            <div className="header-stats">
              <div className="stat-card total">
                <span className="stat-label">Total Tests</span>
                <span className="stat-value">{reportData.summary?.overall?.totalTests || 0}</span>
              </div>
              <div className="stat-card success">
                <span className="stat-label">Passed</span>
                <span className="stat-value">{reportData.summary?.overall?.totalPassed || 0}</span>
              </div>
              <div className="stat-card danger">
                <span className="stat-label">Failed</span>
                <span className="stat-value">{reportData.summary?.overall?.totalFailed || 0}</span>
              </div>
              <div className="stat-card info">
                <span className="stat-label">Success Rate</span>
                <span className="stat-value">
                  {reportData.summary?.overall?.totalTests > 0
                    ? ((reportData.summary.overall.totalPassed / reportData.summary.overall.totalTests) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {loading && !reportData && (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading test results...</p>
          </div>
        )}

        {error && !reportData && (
          <div className="error-message">
            <p>📊 {error}</p>
          </div>
        )}

        {reportData && (
          <div className="dashboard">
            {/* Charts Section */}
            <section className="dashboard-section">
              <h2>Test Performance Overview</h2>
              <div className="charts-grid">
                <div className="chart-container">
                  <h3>Pass/Fail Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={getStatusData()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {getStatusData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-container">
                  <h3>Test Suite Results</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getChartData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="passed" fill="#10b981" name="Passed" />
                      <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Test Suites Details */}
            <section className="dashboard-section">
              <h2>Test Suites Details</h2>
              <div className="suites-grid">
                {reportData.summary?.tests?.map((test, idx) => (
                  <div key={idx} className="suite-card">
                    <div className="suite-header">
                      <h3>{test.type.replace(/_/g, ' ')}</h3>
                      <span className="suite-status">
                        {parseFloat(test.successRate) >= 80 ? '✅' : '⚠️'}
                      </span>
                    </div>
                    <div className="suite-stats">
                      <div className="stat">
                        <span className="label">Status</span>
                        <span className="value">{test.status}</span>
                      </div>
                      <div className="stat">
                        <span className="label">Success Rate</span>
                        <span className="value" style={{
                          color: parseFloat(test.successRate) >= 80 ? '#10b981' : '#ef4444'
                        }}>
                          {test.successRate}
                        </span>
                      </div>
                      <div className="stat">
                        <span className="label">Duration</span>
                        <span className="value">{test.duration}</span>
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{
                          width: test.successRate,
                          backgroundColor: parseFloat(test.successRate) >= 80 ? '#10b981' : '#ef4444'
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Detailed Results */}
            {reportData.details && reportData.details.length > 0 && (
              <section className="dashboard-section">
                <h2>Detailed Test Results</h2>
                {reportData.details.map((detail, idx) => (
                  <div key={idx} className="detail-section">
                    <h3>{detail.type.replace(/_/g, ' ')}</h3>
                    
                    {detail.details && detail.details.length > 0 && (
                      <div className="tests-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Test Name</th>
                              <th>Status</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.details.slice(0, 5).map((test, tidx) => (
                              <tr key={tidx} className={test.status?.toLowerCase()}>
                                <td>{test.name}</td>
                                <td>
                                  <span className={`badge ${test.status?.toLowerCase()}`}>
                                    {test.status || 'N/A'}
                                  </span>
                                </td>
                                <td>{test.details || test.error || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {detail.summary && (
                      <div className="summary-stats">
                        <div className="summary-stat">
                          <span>Total:</span>
                          <strong>{detail.summary.total || 0}</strong>
                        </div>
                        <div className="summary-stat">
                          <span>Passed:</span>
                          <strong style={{ color: '#10b981' }}>{detail.summary.passed || 0}</strong>
                        </div>
                        <div className="summary-stat">
                          <span>Failed:</span>
                          <strong style={{ color: '#ef4444' }}>{detail.summary.failed || 0}</strong>
                        </div>
                        <div className="summary-stat">
                          <span>Duration:</span>
                          <strong>{detail.summary.duration || '-'}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* Actions */}
            <section className="dashboard-section actions">
              <button onClick={handleExportPDF} className="btn-export">
                📄 Export PDF Report
              </button>
              <p className="timestamp">
                Generated: {reportData.generatedAt}
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
