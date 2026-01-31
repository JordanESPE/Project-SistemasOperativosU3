import React, { useState, useEffect } from 'react';
import '../styles/ProjectLoader.css';

function ProjectLoader({ onProjectLoaded, onTestsComplete }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [testStatus, setTestStatus] = useState({ running: false, progress: '', logs: [] });
  const [serverStatus, setServerStatus] = useState({ running: false, port: null });
  const [manualPath, setManualPath] = useState('');
  const [manualUrl, setManualUrl] = useState('http://localhost:3001');
  const [selectedTestType, setSelectedTestType] = useState('all');

  // Polling para estado de tests
  useEffect(() => {
    let interval;
    if (testStatus.running) {
      interval = setInterval(async () => {
        try {
          const response = await fetch('http://localhost:3002/api/project/test-status');
          const status = await response.json();
          setTestStatus(status);
          
          if (!status.running && status.progress.includes('completed')) {
            onTestsComplete?.();
          }
        } catch (err) {
          console.error('Error checking test status:', err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [testStatus.running, onTestsComplete]);

  const handleSelectProject = async () => {
    try {
      // Intentar usar Electron API si está disponible
      if (window.electronAPI?.selectProjectDirectory) {
        const result = await window.electronAPI.selectProjectDirectory();
        if (!result.canceled && result.path) {
          await loadProject(result.path);
        }
      } else {
        // Fallback: usar input manual
        setError('Use the manual path input below');
      }
    } catch (err) {
      setError('Error selecting directory: ' + err.message);
    }
  };

  const loadProject = async (projectPath) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:3002/api/project/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load project');
      }
      
      setProject(data.project);
      onProjectLoaded?.(data.project);
      
      // Actualizar URL por defecto
      if (data.project.port) {
        setManualUrl(`http://localhost:${data.project.port}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualLoad = async () => {
    if (manualPath.trim()) {
      await loadProject(manualPath.trim());
    }
  };

  const handleStartServer = async () => {
    if (!project) return;
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3002/api/project/start-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: project.port || 3001 })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setServerStatus({ running: true, port: data.port });
        setManualUrl(`http://localhost:${data.port}`);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError('Error starting server: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunTests = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:3002/api/project/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          testType: selectedTestType === 'all' ? null : selectedTestType,
          baseUrl: manualUrl 
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setTestStatus({ running: true, progress: 'Starting tests...', logs: [] });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError('Error running tests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTests = async () => {
    try {
      await fetch('http://localhost:3002/api/project/cancel-tests', {
        method: 'POST'
      });
      setTestStatus({ running: false, progress: 'Cancelled', logs: [] });
    } catch (err) {
      console.error('Error cancelling tests:', err);
    }
  };

  return (
    <div className="project-loader">
      <div className="loader-header">
        <h2>📁 Project Loader</h2>
        <p>Load a project to analyze and run tests</p>
      </div>

      {/* Selector de proyecto */}
      <div className="loader-section">
        <h3>1. Select Project</h3>
        <div className="loader-actions">
          <button 
            className="btn btn-primary" 
            onClick={handleSelectProject}
            disabled={loading || testStatus.running}
          >
            📂 Browse for Project
          </button>
          
          <div className="manual-input">
            <input
              type="text"
              placeholder="Or enter project path manually..."
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              disabled={loading || testStatus.running}
            />
            <button 
              className="btn btn-secondary"
              onClick={handleManualLoad}
              disabled={loading || testStatus.running || !manualPath.trim()}
            >
              Load
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {project && (
          <div className="project-info">
            <div className="project-card">
              <div className="project-icon">📦</div>
              <div className="project-details">
                <h4>{project.name}</h4>
                <p className="project-path">{project.path}</p>
                <div className="project-badges">
                  <span className="badge">{project.type}</span>
                  {project.hasServer && <span className="badge success">Has Server</span>}
                  {project.hasFrontend && <span className="badge info">Has Frontend</span>}
                  {project.port && <span className="badge warning">Port: {project.port}</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuración del servidor */}
      {project && (
        <div className="loader-section">
          <h3>2. Server Configuration</h3>
          <div className="server-config">
            <div className="config-row">
              <label>Target URL:</label>
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                disabled={testStatus.running}
                placeholder="http://localhost:3001"
              />
            </div>
            
            {project.hasServer && (
              <div className="config-row">
                <button 
                  className={`btn ${serverStatus.running ? 'btn-success' : 'btn-warning'}`}
                  onClick={handleStartServer}
                  disabled={loading || testStatus.running || serverStatus.running}
                >
                  {serverStatus.running ? '✅ Server Running' : '🚀 Start Project Server'}
                </button>
                {serverStatus.running && (
                  <span className="server-status">Running on port {serverStatus.port}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ejecución de pruebas */}
      {project && (
        <div className="loader-section">
          <h3>3. Run Tests</h3>
          <div className="test-config">
            <div className="config-row">
              <label>Test Type:</label>
              <select 
                value={selectedTestType} 
                onChange={(e) => setSelectedTestType(e.target.value)}
                disabled={testStatus.running}
              >
                <option value="all">🔄 All Tests</option>
                <option value="functional">✅ Functional Tests</option>
                <option value="non-functional">⚙️ Non-Functional Tests</option>
                <option value="load">📊 Load Tests</option>
                <option value="stress">💥 Stress Tests</option>
              </select>
            </div>
            
            <div className="test-actions">
              {!testStatus.running ? (
                <button 
                  className="btn btn-primary btn-large"
                  onClick={handleRunTests}
                  disabled={loading}
                >
                  ▶️ Run Tests
                </button>
              ) : (
                <button 
                  className="btn btn-danger btn-large"
                  onClick={handleCancelTests}
                >
                  ⏹️ Cancel Tests
                </button>
              )}
            </div>
          </div>

          {/* Estado de ejecución */}
          {testStatus.running && (
            <div className="test-status">
              <div className="status-header">
                <div className="spinner-small"></div>
                <span>Running Tests...</span>
              </div>
              <div className="status-progress">
                {testStatus.progress}
              </div>
              <div className="status-logs">
                {testStatus.logs.slice(-5).map((log, index) => (
                  <div key={index} className="log-line">{log}</div>
                ))}
              </div>
            </div>
          )}

          {!testStatus.running && testStatus.progress && (
            <div className={`test-result ${testStatus.progress.includes('error') ? 'error' : 'success'}`}>
              {testStatus.progress}
            </div>
          )}
        </div>
      )}

      {/* Área de ayuda */}
      {!project && (
        <div className="help-section">
          <h3>💡 Getting Started</h3>
          <ol>
            <li>Click "Browse for Project" to select a Node.js project folder</li>
            <li>Or enter the full path to your project manually</li>
            <li>Configure the target URL where your server is running</li>
            <li>Select the type of tests you want to run</li>
            <li>Click "Run Tests" to start the analysis</li>
          </ol>
          <p className="help-note">
            <strong>Note:</strong> The project should have a server running at the specified URL. 
            If your project has a server.js file, you can start it from this interface.
          </p>
        </div>
      )}
    </div>
  );
}

export default ProjectLoader;
