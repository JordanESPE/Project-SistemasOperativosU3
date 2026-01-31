const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const isDev = process.env.NODE_ENV === 'development';

// Iniciar servidor de reportes
function startReportServer() {
  return new Promise((resolve, reject) => {
    const reportServerPath = path.join(__dirname, 'report-server.js');
    serverProcess = spawn('node', [reportServerPath], {
      stdio: 'pipe',
      detached: false
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`Server: ${data}`);
      resolve();
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      reject(error);
    });
  });
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  mainWindow.loadURL('http://localhost:3002');

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.on('ready', async () => {
  try {
    await startReportServer();
    setTimeout(() => {
      createWindow();
    }, 1000);
  } catch (error) {
    console.error('Failed to start app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers for directory selection
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Directory to Scan for Projects'
  });
  
  if (result.canceled) {
    return { canceled: true };
  }
  
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle('select-project-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Directory'
  });
  
  if (result.canceled) {
    return { canceled: true };
  }
  
  return { canceled: false, path: result.filePaths[0] };
});

// IPC Handlers for PDF export
ipcMain.handle('export-pdf', async (event, reportData) => {
  try {
    const doc = new PDFDocument({ margin: 40 });
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filepath = path.join(app.getPath('downloads'), `test-report-${timestamp}.pdf`);

    doc.pipe(fs.createWriteStream(filepath));

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('TEST REPORT - Testing System v1.0', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(new Date().toLocaleString('es-ES'), { align: 'center' });
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Summary
    doc.fontSize(14).font('Helvetica-Bold').text('SUMMARY');
    doc.moveDown(0.5);

    if (reportData.summary && reportData.summary.tests) {
      const summaryData = reportData.summary.tests.map(test => [
        test.type.replace(/_/g, ' '),
        test.status,
        test.successRate || 'N/A',
        test.duration || 'N/A'
      ]);

      addTable(doc, ['Test Type', 'Result', 'Success Rate', 'Duration'], summaryData);
    }

    doc.moveDown(1);

    // Details
    if (reportData.details && Array.isArray(reportData.details)) {
      reportData.details.forEach((detail, index) => {
        if (index > 0) doc.addPage();
        
        doc.fontSize(14).font('Helvetica-Bold').text(detail.type);
        doc.moveDown(0.5);
        
        if (detail.summary) {
          doc.fontSize(10).font('Helvetica');
          doc.text(`Total: ${detail.summary.total || 0}`);
          doc.text(`Passed: ${detail.summary.passed || 0}`);
          doc.text(`Failed: ${detail.summary.failed || 0}`);
          doc.text(`Duration: ${detail.summary.duration || 'N/A'}`);
        }
        
        doc.moveDown(1);
      });
    }

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('finish', () => {
        resolve({ success: true, path: filepath });
      });
      doc.on('error', reject);
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function addTable(doc, headers, rows) {
  const startY = doc.y;
  const pageWidth = doc.page.width - 80;
  const colWidths = pageWidth / headers.length;

  doc.fontSize(9).font('Helvetica-Bold');
  headers.forEach((header, i) => {
    doc.text(header, 40 + i * colWidths, startY, { width: colWidths - 5, align: 'left' });
  });

  doc.moveTo(40, startY + 20).lineTo(555, startY + 20).stroke();

  doc.fontSize(8).font('Helvetica');
  let currentY = startY + 25;

  rows.forEach(row => {
    row.forEach((cell, i) => {
      doc.text(String(cell || ''), 40 + i * colWidths, currentY, {
        width: colWidths - 5,
        align: 'left',
        ellipsis: true
      });
    });
    currentY += 20;

    if (currentY > doc.page.height - 40) {
      doc.addPage();
      currentY = 40;
    }
  });
}
