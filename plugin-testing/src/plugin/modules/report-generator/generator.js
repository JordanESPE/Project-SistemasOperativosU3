const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(outputDir = './reports') {
    this.outputDir = outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  async generateReport(testResults) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    
    // Generar JSON primero
    const jsonPath = await this.generateJSON(testResults, timestamp);
    
    // Generar PDF
    const pdfPath = await this.generatePDF(testResults, timestamp);

    return {
      pdf: pdfPath,
      json: jsonPath,
      timestamp: timestamp
    };
  }

  generateJSON(testResults, timestamp) {
    const filename = `test-report-${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    const reportData = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(testResults),
      details: testResults,
      generatedAt: new Date().toLocaleString('es-ES')
    };

    return new Promise((resolve, reject) => {
      fs.writeFile(filepath, JSON.stringify(reportData, null, 2), (err) => {
        if (err) reject(err);
        else resolve(filepath);
      });
    });
  }

  generateSummary(testResults) {
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    return {
      tests: testResults.map(result => ({
        type: result.type,
        status: result.summary.passed + '/' + result.summary.total,
        successRate: result.summary.successRate,
        duration: result.summary.duration
      })),
      overall: {
        totalTests: testResults.reduce((acc, r) => acc + (r.summary.total || 0), 0),
        totalPassed: testResults.reduce((acc, r) => acc + (r.summary.passed || 0), 0),
        totalFailed: testResults.reduce((acc, r) => acc + (r.summary.failed || 0), 0)
      }
    };
  }

  generatePDF(testResults, timestamp) {
    const filename = `test-report-${timestamp}.pdf`;
    const filepath = path.join(this.outputDir, filename);

    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Encabezado
    this.addHeader(doc);

    // Resumen general
    this.addSummary(doc, testResults);

    // Detalles por tipo de prueba
    testResults.forEach((result, index) => {
      if (index > 0) doc.addPage();
      this.addTestDetails(doc, result);
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  addHeader(doc) {
    doc.fontSize(24).font('Helvetica-Bold').text('TEST REPORT - Testing System v1.0', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(new Date().toLocaleString('es-ES'), { align: 'center' });
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);
  }

  addSummary(doc, testResults) {
    doc.fontSize(14).font('Helvetica-Bold').text('SUMMARY');
    doc.moveDown(0.5);

    // Tabla de resumen
    const summaryData = testResults.map(result => ({
      type: result.type.replace(/_/g, ' '),
      status: result.summary.passed + '/' + result.summary.total,
      rate: result.summary.successRate,
      duration: result.summary.duration
    }));

    this.addTable(doc, 
      ['Test Type', 'Result', 'Success Rate', 'Duration'],
      summaryData.map(d => [d.type, d.status, d.rate, d.duration])
    );

    doc.moveDown(1);
  }

  addTestDetails(doc, testResult) {
    const typeLabels = {
      'FUNCTIONAL_TESTS': '[OK] Functional Tests',
      'NON_FUNCTIONAL_TESTS': '[VERIFY] Non Functional Tests',
      'LOAD_TEST': '[LOAD] Load Test',
      'STRESS_TEST': '[STRESS] Stress Test'
    };

    doc.fontSize(14).font('Helvetica-Bold').text(typeLabels[testResult.type] || testResult.type);
    doc.moveDown(0.5);

    // Información general
    const summary = testResult.summary;
    doc.fontSize(10).font('Helvetica');
    
    if (testResult.type === 'FUNCTIONAL_TESTS' || testResult.type === 'NON_FUNCTIONAL_TESTS') {
      doc.text(`Total: ${summary.total} | Successful: ${summary.passed} | Failed: ${summary.failed}`);
      doc.text(`Success Rate: ${summary.successRate}`);
    } else if (testResult.type === 'LOAD_TEST') {
      doc.text(`Total Requests: ${summary.totalRequests}`);
      doc.text(`Successful: ${summary.successfulRequests} | Failed: ${summary.failedRequests}`);
      doc.text(`Error Rate: ${summary.errorRate}`);
      doc.text(`Average Response Time: ${testResult.metrics.avgResponseTime}`);
      doc.text(`Requests per Second: ${testResult.metrics.requestsPerSecond}`);
    } else if (testResult.type === 'STRESS_TEST') {
      doc.text(`Max Concurrent Requests: ${testResult.summary.maxConcurrentRequests}`);
      doc.text(`System Limit Reached: ${testResult.summary.systemLimitReached ? 'Yes' : 'No'}`);
      doc.text(`Analysis: ${testResult.analysis.breakPoint}`);
    }

    doc.text(`Duration: ${summary.duration}`);
    doc.text(`Timestamp: ${testResult.timestamp}`);

    doc.moveDown(0.5);

    // Detalles específicos
    if (testResult.details && Array.isArray(testResult.details)) {
      doc.fontSize(11).font('Helvetica-Bold').text('Details:');
      doc.fontSize(9).font('Helvetica');

      const tableData = testResult.details.map(detail => [
        detail.name || '',
        detail.status || '',
        detail.details || ''
      ]);

      this.addTable(doc, ['Test', 'Status', 'Details'], tableData.slice(0, 10));

      if (tableData.length > 10) {
        doc.fontSize(9).text(`... and ${tableData.length - 10} more`);
      }
    }

    // Métricas adicionales para load/stress
    if (testResult.metrics) {
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica-Bold').text('Metrics:');
      doc.fontSize(9).font('Helvetica');

      Object.entries(testResult.metrics).forEach(([key, value]) => {
        doc.text(`${key}: ${value}`);
      });
    }

    doc.moveDown(1);
  }

  addTable(doc, headers, rows) {
    const startY = doc.y;
    const pageWidth = doc.page.width - 80;
    const colWidths = pageWidth / headers.length;

    // Encabezados
    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, 40 + i * colWidths, startY, { width: colWidths - 5, align: 'left' });
    });

    // Línea separadora
    doc.moveTo(40, startY + 20).lineTo(555, startY + 20).stroke();

    // Filas
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

      // Nueva página si es necesario
      if (currentY > doc.page.height - 40) {
        doc.addPage();
        currentY = 40;
      }
    });
  }
}

module.exports = ReportGenerator;
