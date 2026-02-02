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
    // Calcular totales correctamente:
    // - Funcionales y No Funcionales: contar cada prueba individual
    // - Load y Stress: contar como 1 prueba cada uno
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    testResults.forEach(r => {
      if (r.type === 'FUNCTIONAL_TESTS' || r.type === 'NON_FUNCTIONAL_TESTS') {
        totalTests += r.summary.total || 0;
        totalPassed += r.summary.passed || 0;
        totalFailed += r.summary.failed || 0;
      } else if (r.type === 'LOAD_TEST') {
        totalTests += 1;
        const errorRate = parseFloat(r.summary.errorRate) || 0;
        if (errorRate < 10) {
          totalPassed += 1;
        } else {
          totalFailed += 1;
        }
      } else if (r.type === 'STRESS_TEST') {
        totalTests += 1;
        if (!r.summary.systemLimitReached) {
          totalPassed += 1;
        } else {
          totalFailed += 1;
        }
      }
    });

    return {
      tests: testResults.map(result => ({
        type: result.type,
        status: result.summary.passed + '/' + result.summary.total,
        successRate: result.summary.successRate,
        duration: result.summary.duration
      })),
      overall: {
        totalTests,
        totalPassed,
        totalFailed
      }
    };
  }

  generatePDF(testResults, timestamp) {
    const filename = `test-report-${timestamp}.pdf`;
    const filepath = path.join(this.outputDir, filename);

    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4'
    });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Encabezado
    this.addHeader(doc);

    // Resumen general
    this.addSummary(doc, testResults);

    // Detalles por tipo de prueba
    testResults.forEach((result, index) => {
      // Verificar si necesitamos nueva página
      if (index > 0) {
        const spaceNeeded = 300;
        const spaceAvailable = doc.page.height - doc.y - 80;
        
        if (spaceAvailable < spaceNeeded) {
          doc.addPage();
        } else {
          doc.moveDown(2);
        }
      }
      
      this.addTestDetails(doc, result);
    });

    // Agregar sección de recomendaciones
    const spaceForRecommendations = 300;
    const availableSpace = doc.page.height - doc.y - 80;
    
    if (availableSpace < spaceForRecommendations) {
      doc.addPage();
    } else {
      doc.moveDown(2);
    }
    
    this.addRecommendations(doc, testResults);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    });
  }

  addHeader(doc) {
    // Banner superior con color de fondo
    doc.rect(0, 0, doc.page.width, 120).fill('#4A90E2');
    
    // Título principal
    doc.fillColor('#FFFFFF')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text('TEST REPORT', 50, 30, { align: 'center' });
    
    // Subtítulo
    doc.fillColor('#E8F4FD')
       .fontSize(16)
       .font('Helvetica')
       .text('Testing System v1.0', 50, 65, { align: 'center' });
    
    // Fecha y hora
    doc.fillColor('#FFFFFF')
       .fontSize(11)
       .font('Helvetica')
       .text(new Date().toLocaleString('es-ES', {
         dateStyle: 'full',
         timeStyle: 'medium'
       }), 50, 90, { align: 'center' });
    
    // Línea decorativa
    doc.rect(0, 120, doc.page.width, 3).fill('#2E5C8A');
    
    // Restablecer color para el resto del contenido
    doc.fillColor('#000000');
    doc.moveDown(4);
  }

  addSummary(doc, testResults) {
    // Título de sección con estilo
    doc.rect(50, doc.y, doc.page.width - 100, 35)
       .fillAndStroke('#F0F4F8', '#4A90E2');
    
    const titleY = doc.y + 10;
    doc.fillColor('#2E5C8A')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('RESUMEN EJECUTIVO', 60, titleY);
    
    doc.fillColor('#000000');
    doc.moveDown(2.5);

    // Calcular estadísticas totales
    // Solo contar pruebas funcionales y no funcionales como pruebas individuales
    // Load y Stress tests cuentan como 1 prueba cada uno (no por request)
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    
    testResults.forEach(r => {
      if (r.type === 'FUNCTIONAL_TESTS' || r.type === 'NON_FUNCTIONAL_TESTS') {
        const tests = r.summary.total || 0;
        const passed = r.summary.passed || 0;
        const failed = r.summary.failed || 0;
        
        totalTests += tests;
        totalPassed += passed;
        totalFailed += failed;
      } else if (r.type === 'LOAD_TEST') {
        // Contar como 1 prueba de carga, no por cada request
        totalTests += 1;
        const errorRate = parseFloat(r.summary.errorRate) || 0;
        if (errorRate < 10) {
          totalPassed += 1;
        } else {
          totalFailed += 1;
        }
      } else if (r.type === 'STRESS_TEST') {
        // Contar como 1 prueba de estrés
        totalTests += 1;
        if (!r.summary.systemLimitReached) {
          totalPassed += 1;
        } else {
          totalFailed += 1;
        }
      }
    });
    
    const overallSuccessRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(2) + '%' : '0.00%';

    // Tarjetas de estadísticas
    const startY = doc.y;
    this.addStatCard(doc, 'Total de Pruebas', totalTests.toString(), '#4A90E2', 50, startY);
    this.addStatCard(doc, 'Exitosas', totalPassed.toString(), '#2ECC71', 230, startY);
    this.addStatCard(doc, 'Fallidas', totalFailed.toString(), '#E74C3C', 410, startY);
    
    doc.y = startY + 85;

    // Tasa de éxito general con barra de progreso
    const successPercent = parseFloat(overallSuccessRate) || 0;
    const barStartY = doc.y;
    
    doc.fontSize(12).font('Helvetica-Bold').text('Tasa de Exito General:', 50, barStartY);
    
    const barWidth = 350;
    const barHeight = 25;
    const fillWidth = Math.max(0, (successPercent / 100) * barWidth);
    const barX = 240;
    const barY = barStartY - 3;
    
    // Barra de fondo
    doc.rect(barX, barY, barWidth, barHeight)
       .fillAndStroke('#E0E0E0', '#CCCCCC');
    
    // Barra de progreso solo si hay progreso
    if (fillWidth > 0) {
      const barColor = successPercent >= 80 ? '#2ECC71' : successPercent >= 50 ? '#F39C12' : '#E74C3C';
      doc.rect(barX, barY, fillWidth, barHeight)
         .fill(barColor);
    }
    
    // Texto del porcentaje - siempre visible
    doc.fillColor('#2C3E50')
       .fontSize(12)
       .font('Helvetica-Bold')
       .text(overallSuccessRate, barX + barWidth + 10, barStartY);
    
    doc.fillColor('#000000');
    doc.moveDown(2);

    // Tabla de resumen
    const summaryData = testResults.map(result => {
      let passed = 0;
      let total = 0;
      
      if (result.type === 'FUNCTIONAL_TESTS' || result.type === 'NON_FUNCTIONAL_TESTS') {
        passed = result.summary.passed || 0;
        total = result.summary.total || 0;
      } else if (result.type === 'LOAD_TEST') {
        passed = Math.max(0, result.summary.successfulRequests || 0);
        total = result.summary.totalRequests || 0;
      } else if (result.type === 'STRESS_TEST') {
        passed = 0;
        total = result.summary.maxConcurrentRequests || 0;
      }
      
      return {
        type: this.formatTestType(result.type),
        status: passed + '/' + total,
        rate: result.summary.successRate || result.summary.errorRate || 'N/A',
        duration: result.summary.duration || 'N/A'
      };
    });

    this.addStyledTable(doc, 
      ['Tipo de Prueba', 'Resultado', 'Tasa de Éxito', 'Duración'],
      summaryData.map(d => [d.type, d.status, d.rate, d.duration])
    );

    doc.moveDown(2);
  }

  addTestDetails(doc, testResult) {
    const typeLabels = {
      'FUNCTIONAL_TESTS': 'Pruebas Funcionales',
      'NON_FUNCTIONAL_TESTS': 'Pruebas No Funcionales',
      'LOAD_TEST': 'Prueba de Carga',
      'STRESS_TEST': 'Prueba de Estres'
    };

    const typeColors = {
      'FUNCTIONAL_TESTS': '#2ECC71',
      'NON_FUNCTIONAL_TESTS': '#3498DB',
      'LOAD_TEST': '#F39C12',
      'STRESS_TEST': '#E74C3C'
    };

    const color = typeColors[testResult.type] || '#95A5A6';

    // Título de sección con color
    doc.rect(50, doc.y, doc.page.width - 100, 40)
       .fillAndStroke(color, color);
    
    const titleY = doc.y + 12;
    doc.fillColor('#FFFFFF')
       .fontSize(18)
       .font('Helvetica-Bold')
       .text(typeLabels[testResult.type] || testResult.type, 60, titleY);
    
    doc.fillColor('#000000');
    doc.moveDown(2.2);

    // Información general en cajas
    const summary = testResult.summary;
    
    // Box con información resumida
    this.addInfoBox(doc, 'Informacion General');
    doc.fontSize(10).font('Helvetica');
    
    if (testResult.type === 'FUNCTIONAL_TESTS' || testResult.type === 'NON_FUNCTIONAL_TESTS') {
      this.addInfoLine(doc, 'Total de Pruebas', summary.total);
      this.addInfoLine(doc, 'Exitosas', summary.passed, '#2ECC71');
      this.addInfoLine(doc, 'Fallidas', summary.failed, '#E74C3C');
      this.addInfoLine(doc, 'Tasa de Éxito', summary.successRate);
    } else if (testResult.type === 'LOAD_TEST') {
      this.addInfoLine(doc, 'Total de Solicitudes', summary.totalRequests);
      this.addInfoLine(doc, 'Exitosas', summary.successfulRequests, '#2ECC71');
      this.addInfoLine(doc, 'Fallidas', summary.failedRequests, '#E74C3C');
      this.addInfoLine(doc, 'Tasa de Error', summary.errorRate);
      this.addInfoLine(doc, 'Tiempo Promedio', testResult.metrics?.avgResponseTime);
      this.addInfoLine(doc, 'Solicitudes/seg', testResult.metrics?.requestsPerSecond);
    } else if (testResult.type === 'STRESS_TEST') {
      this.addInfoLine(doc, 'Solicitudes Concurrentes', testResult.summary.maxConcurrentRequests);
      this.addInfoLine(doc, 'Límite Alcanzado', testResult.summary.systemLimitReached ? 'Sí' : 'No');
      this.addInfoLine(doc, 'Análisis', testResult.analysis?.breakPoint);
    }

    this.addInfoLine(doc, 'Duración', summary.duration);
    this.addInfoLine(doc, 'Fecha/Hora', new Date(testResult.timestamp).toLocaleString('es-ES'));

    doc.moveDown(0.8);

    // Detalles específicos
    if (testResult.details && Array.isArray(testResult.details) && testResult.details.length > 0) {
      this.addInfoBox(doc, 'Detalles de Pruebas');
      doc.moveDown(0.3);

      const tableData = testResult.details.map(detail => [
        detail.name || '',
        detail.status || '',
        (detail.details || '').substring(0, 40) + (detail.details?.length > 40 ? '...' : '')
      ]);

      // Mostrar solo los primeros 5 para evitar páginas extras
      this.addStyledTable(doc, ['Prueba', 'Estado', 'Detalles'], tableData.slice(0, 5));

      if (tableData.length > 5) {
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#7F8C8D').text(`... y ${tableData.length - 5} pruebas más (total: ${tableData.length})`, 55, doc.y);
        doc.fillColor('#000000');
      }
    }

    // Métricas adicionales para load/stress
    if (testResult.metrics && Object.keys(testResult.metrics).length > 0) {
      doc.moveDown(0.5);
      this.addInfoBox(doc, 'Metricas Detalladas');
      doc.fontSize(9).font('Helvetica');

      // Mostrar solo las métricas más importantes
      const importantMetrics = ['avgResponseTime', 'maxResponseTime', 'minResponseTime', 'requestsPerSecond'];
      let count = 0;
      Object.entries(testResult.metrics).forEach(([key, value]) => {
        if (importantMetrics.includes(key) || count < 6) {
          this.addInfoLine(doc, this.formatMetricName(key), value);
          count++;
        }
      });
    }

    doc.moveDown(0.5);
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
    });
  }

  // Nuevos métodos para mejorar la estética

  addStyledTable(doc, headers, rows) {
    // Tabla simple sin posicionamiento absoluto
    const colWidth = (doc.page.width - 100) / headers.length;
    
    // Encabezados en una sola línea
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#4A90E2');
    let headerLine = headers.join('  |  ');
    doc.text(headerLine, 55);
    
    // Línea separadora
    doc.moveDown(0.2);
    doc.strokeColor('#4A90E2').lineWidth(1);
    doc.moveTo(55, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.3);
    
    // Filas
    doc.font('Helvetica').fontSize(8).fillColor('#2C3E50');
    rows.forEach((row, idx) => {
      const rowText = row.map(cell => String(cell || '-').substring(0, 25)).join('  |  ');
      doc.text(rowText, 55);
      doc.moveDown(0.1);
    });
    
    doc.fillColor('#000000');
    doc.moveDown(0.3);
  }

  addStatCard(doc, label, value, color, x = 50, y = null) {
    const cardY = y !== null ? y : doc.y;
    const width = 170;
    const height = 70;

    // Sombra
    doc.rect(x + 2, cardY + 2, width, height)
       .fill('#E0E0E0');

    // Tarjeta principal
    doc.rect(x, cardY, width, height)
       .fillAndStroke('#FFFFFF', color);

    // Línea superior de color
    doc.rect(x, cardY, width, 5)
       .fill(color);

    // Etiqueta
    doc.fillColor('#7F8C8D')
       .fontSize(10)
       .font('Helvetica')
       .text(label, x + 15, cardY + 20, { width: width - 30, align: 'left' });

    // Valor
    doc.fillColor(color)
       .fontSize(24)
       .font('Helvetica-Bold')
       .text(value, x + 15, cardY + 35, { width: width - 30, align: 'left' });

    doc.fillColor('#000000');
  }

  addInfoBox(doc, title) {
    doc.fillColor('#4A90E2')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text('▸ ' + title, 55);
    doc.fillColor('#000000');
    doc.moveDown(0.3);
  }

  addInfoLine(doc, label, value, color = '#2C3E50') {
    doc.fontSize(8)
       .font('Helvetica-Bold')
       .fillColor('#7F8C8D')
       .text('  • ' + label + ': ', 55, doc.y, { continued: true })
       .font('Helvetica')
       .fillColor(color)
       .text(String(value || 'N/A'));
  }

  formatTestType(type) {
    const typeMap = {
      'FUNCTIONAL_TESTS': 'Pruebas Funcionales',
      'NON_FUNCTIONAL_TESTS': 'Pruebas No Funcionales',
      'LOAD_TEST': 'Prueba de Carga',
      'STRESS_TEST': 'Prueba de Estrés'
    };
    return typeMap[type] || type.replace(/_/g, ' ');
  }

  formatMetricName(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  addRecommendations(doc, testResults) {
    // Título de la sección
    doc.rect(50, doc.y, doc.page.width - 100, 40)
       .fillAndStroke('#9B59B6', '#9B59B6');
    
    const titleY = doc.y + 12;
    doc.fillColor('#FFFFFF')
       .fontSize(18)
       .font('Helvetica-Bold')
       .text('Recomendaciones y Analisis', 60, titleY);
    
    doc.fillColor('#000000');
    doc.moveDown(3);

    // Analizar resultados
    const recommendations = this.generateRecommendations(testResults);

    // Errores comunes detectados (máximo 3)
    if (recommendations.errors.length > 0) {
      this.addInfoBox(doc, 'Posibles Errores Detectados');
      doc.fontSize(9).font('Helvetica');
      
      recommendations.errors.slice(0, 3).forEach((error, index) => {
        doc.fillColor('#E74C3C')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text(`${index + 1}. ${error.title}`, { continued: false });
        
        doc.fillColor('#2C3E50')
           .fontSize(8)
           .font('Helvetica')
           .text(error.description, { width: doc.page.width - 120 });
        
        doc.moveDown(0.3);
      });
      
      doc.moveDown(0.5);
    }

    // Recomendaciones de mejora (máximo 3)
    if (recommendations.improvements.length > 0) {
      this.addInfoBox(doc, 'Recomendaciones de Mejora');
      doc.fontSize(9).font('Helvetica');
      
      recommendations.improvements.slice(0, 3).forEach((improvement, index) => {
        doc.fillColor('#2ECC71')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text(`${index + 1}. ${improvement.title}`, { continued: false });
        
        doc.fillColor('#2C3E50')
           .fontSize(8)
           .font('Helvetica')
           .text(improvement.description, { width: doc.page.width - 120 });
        
        doc.moveDown(0.3);
      });
      
      doc.moveDown(0.5);
    }

    // Acciones prioritarias (máximo 3)
    if (recommendations.actions.length > 0) {
      this.addInfoBox(doc, 'Acciones Prioritarias');
      doc.fontSize(9).font('Helvetica');
      
      recommendations.actions.slice(0, 3).forEach((action, index) => {
        const priorityColor = action.priority === 'ALTA' ? '#E74C3C' : 
                             action.priority === 'MEDIA' ? '#F39C12' : '#3498DB';
        
        doc.fillColor(priorityColor)
           .fontSize(9)
           .font('Helvetica-Bold')
           .text(`[${action.priority}] ${action.title}`, { continued: false });
        
        doc.fillColor('#2C3E50')
           .fontSize(8)
           .font('Helvetica')
           .text(action.description, { width: doc.page.width - 120 });
        
        doc.moveDown(0.3);
      });
    }

    doc.fillColor('#000000');
  }

  generateRecommendations(testResults) {
    const errors = [];
    const improvements = [];
    const actions = [];

    // Analizar cada tipo de prueba
    testResults.forEach(result => {
      if (result.type === 'FUNCTIONAL_TESTS') {
        if (result.summary.failed > 0) {
          errors.push({
            title: 'Servidor no disponible',
            description: 'El servidor backend no esta en ejecucion (puerto 3001). Verifique que el servidor este iniciado correctamente antes de ejecutar las pruebas.'
          });

          actions.push({
            priority: 'ALTA',
            title: 'Iniciar el servidor backend',
            description: 'Ejecute "cd tienda-ecommerce && npm start" o "node src/backend/server.js" para iniciar el servidor en el puerto 3001.'
          });
        }

        if (result.summary.successRate === '0.00%') {
          improvements.push({
            title: 'Configurar variables de entorno',
            description: 'Asegurese de que las variables de entorno esten correctamente configuradas, especialmente la URL base del API y el puerto del servidor.'
          });
        }
      }

      if (result.type === 'NON_FUNCTIONAL_TESTS') {
        const failedCount = result.summary.failed || 0;
        if (failedCount > 0) {
          errors.push({
            title: 'Problemas de conectividad o rendimiento',
            description: 'Algunas pruebas no funcionales fallaron. Esto puede indicar problemas de tiempo de respuesta o configuracion CORS.'
          });

          improvements.push({
            title: 'Optimizar tiempos de respuesta',
            description: 'Considere implementar cache, optimizar consultas a la base de datos o mejorar los indices para reducir tiempos de respuesta.'
          });
        }
      }

      if (result.type === 'LOAD_TEST') {
        const errorRate = parseFloat(result.summary.errorRate) || 0;
        
        if (errorRate > 50) {
          errors.push({
            title: 'Alta tasa de error en pruebas de carga',
            description: `La tasa de error es del ${result.summary.errorRate}. El sistema no puede manejar la carga actual. Verifique la disponibilidad del servidor.`
          });

          actions.push({
            priority: 'ALTA',
            title: 'Escalar recursos del servidor',
            description: 'Aumente la capacidad del servidor o implemente balanceo de carga para manejar multiples solicitudes concurrentes.'
          });
        } else if (errorRate > 10) {
          improvements.push({
            title: 'Mejorar manejo de carga',
            description: 'La tasa de error indica que el sistema tiene dificultades bajo carga. Considere optimizar el codigo o implementar un pool de conexiones.'
          });

          actions.push({
            priority: 'MEDIA',
            title: 'Implementar limitacion de tasa (Rate Limiting)',
            description: 'Configure limites de solicitudes para proteger el servidor de sobrecarga.'
          });
        }
      }

      if (result.type === 'STRESS_TEST') {
        if (result.summary.systemLimitReached) {
          improvements.push({
            title: 'Limite del sistema alcanzado',
            description: `El sistema alcanzo su limite con ${result.summary.maxConcurrentRequests} solicitudes concurrentes. Considere escalar horizontalmente o optimizar recursos.`
          });

          actions.push({
            priority: 'MEDIA',
            title: 'Planificar escalabilidad',
            description: 'Implemente auto-scaling o adicione mas instancias del servidor para manejar picos de trafico.'
          });
        }
      }
    });

    // Recomendaciones generales si no hay servidor
    const allFailed = testResults.every(r => 
      (r.summary.failed > 0 || r.summary.failedRequests > 0) &&
      (r.summary.passed === 0 || r.summary.successfulRequests === 0)
    );

    if (allFailed) {
      actions.push({
        priority: 'ALTA',
        title: 'Verificar configuracion completa',
        description: 'Todas las pruebas fallaron. Pasos: 1) Verificar que el servidor este ejecutandose, 2) Revisar configuracion de puertos, 3) Verificar conexion a base de datos, 4) Revisar logs del servidor.'
      });

      improvements.push({
        title: 'Implementar health checks',
        description: 'Agregue endpoints de verificacion de salud (/health) para monitorear el estado del servidor y sus dependencias.'
      });
    }

    // Si hay pruebas exitosas
    const hasSuccess = testResults.some(r => 
      (r.summary.passed > 0 || r.summary.successfulRequests > 0)
    );

    if (hasSuccess) {
      improvements.push({
        title: 'Continuar con pruebas automatizadas',
        description: 'Integre estas pruebas en su pipeline CI/CD para detectar problemas tempranamente.'
      });

      actions.push({
        priority: 'BAJA',
        title: 'Documentar casos de prueba',
        description: 'Mantenga documentacion actualizada de todos los casos de prueba y sus resultados esperados.'
      });
    }

    return { errors, improvements, actions };
  }

  addPageNumbers(doc) {
    const range = doc.bufferedPageRange();
    
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      
      // Solo agregar número de página, sin líneas extra
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#7F8C8D')
         .text(
           `Página ${i + 1} de ${range.count}`,
           0,
           doc.page.height - 40,
           { align: 'center', width: doc.page.width }
         );
    }
    
    doc.fillColor('#000000');
  }
}

module.exports = ReportGenerator;
