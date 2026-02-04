import React, { useState, useEffect } from 'react';
import ReportViewer from './components/ReportViewer';
import ProjectLoader from './components/ProjectLoader';
import './App.css';

function App() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [activeTab, setActiveTab] = useState('loader'); 
  const [loadedProject, setLoadedProject] = useState(null);

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

  const handleProjectLoaded = (project) => {
    setLoadedProject(project);
  };

  const handleTestsComplete = () => {
    setTestRunning(false);
    loadLatestReport();
    setActiveTab('reports');
  };

  // Función para reiniciar todo y volver a la vista principal
  const handleReset = async () => {
    console.log('[RESET] Iniciando reset...');
    // Limpiar el proyecto cargado en el servidor
    try {
      const response = await fetch('http://localhost:3002/api/project/unload', { method: 'POST' });
      const data = await response.json();
      console.log('[RESET] Servidor respondió:', data);
    } catch (e) {
      console.log('[RESET] Error al descargar proyecto:', e);
    }
    
    // Reiniciar estados
    setLoadedProject(null);
    setReportData(null);
    setError(null);
    setLoading(false);
    setTestRunning(false);
    setActiveTab('loader');
    console.log('[RESET] Estado limpiado, cambiando a loader');
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <h1><i className="bi bi-lightning-charge-fill"></i> Testing Plugin</h1>
            <p>Visual Report Viewer & Analyzer</p>
            {loadedProject && (
              <span className="loaded-project-badge">
                <i className="bi bi-box-seam"></i> {loadedProject.name}
              </span>
            )}
          </div>
          {reportData && activeTab === 'reports' && (
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
              {(reportData.summary?.overall?.totalWarnings || 0) > 0 && (
                <div className="stat-badge warning">
                  <span className="stat-label">Warnings</span>
                  <span className="stat-value">{reportData.summary?.overall?.totalWarnings}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="header-actions">
          <div className="tab-buttons">
            <button 
              className={`btn btn-tab ${activeTab === 'loader' ? 'active' : ''}`}
              onClick={() => setActiveTab('loader')}
            >
              <i className="bi bi-folder2-open"></i> Load Project
            </button>
            <button 
              className={`btn btn-tab ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              <i className="bi bi-bar-chart-fill"></i> View Reports
            </button>
          </div>
          {activeTab === 'reports' && (
            <>
              <button className="btn btn-export" onClick={handleExportPDF} disabled={!reportData || testRunning}>
                <i className="bi bi-download"></i> Export PDF
              </button>
              <button className="btn btn-refresh" onClick={handleReset} disabled={testRunning}>
                <i className="bi bi-arrow-clockwise"></i> New Test
              </button>
            </>
          )}
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'loader' ? (
          <ProjectLoader 
            onProjectLoaded={handleProjectLoaded}
            onTestsComplete={handleTestsComplete}
          />
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}

export default App;
