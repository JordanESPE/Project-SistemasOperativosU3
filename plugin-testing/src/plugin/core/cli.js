#!/usr/bin/env node

const TestExecutor = require('./executor');

const args = process.argv.slice(2);
const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

// Log para depuración - mostrar la URL que se está usando
console.log(`\n[CONFIG] Testing against: ${baseUrl}`);
console.log(`[CONFIG] BASE_URL env: ${process.env.BASE_URL || '(not set, using default)'}\n`);

async function main() {
  // Leer rutas detectadas del environment (si existen)
  const detectedRoutes = process.env.DETECTED_ROUTES 
    ? JSON.parse(process.env.DETECTED_ROUTES) 
    : [];
  
  const executor = new TestExecutor(baseUrl, detectedRoutes);

  // Sin argumentos o --all: ejecutar todo
  if (args.length === 0 || args.includes('--all')) {
    await executor.executeAll();
  }
  // Pruebas funcionales
  else if (args.includes('--functional')) {
    await executor.executeFunctional();
  }
  // Pruebas no funcionales
  else if (args.includes('--non-functional')) {
    await executor.executeNonFunctional();
  }
  // Prueba de carga
  else if (args.includes('--load')) {
    await executor.executeLoad();
  }
  // Prueba de estrés
  else if (args.includes('--stress')) {
    await executor.executeStress();
  }
  // Generar reporte
  else if (args.includes('--report')) {
    await executor.generateReport();
  }
  // Help
  else if (args.includes('--help') || args.includes('-h')) {
    showHelp();
  }
  else {
    console.log('Unrecognized argument. Use --help to see available options.');
    showHelp();
  }
}

function showHelp() {
  console.log(`
========================================================================
             TESTING PLUGIN - HELP
========================================================================

USAGE:
  npm run plugin:<option>

OPTIONS:
  npm run plugin:all              Run all test types
  npm run plugin:functional       Run functional tests
  npm run plugin:non-functional   Run non-functional tests
  npm run plugin:load             Run load test
  npm run plugin:stress           Run stress test
  npm run plugin:report           Generate report of last test

EXAMPLES:
  npm run plugin:all              # Complete suite
  npm run plugin:functional       # Functional tests only
  npm run plugin:load             # Load test only

ENVIRONMENT VARIABLES:
  BASE_URL                        Server base URL (default: http://localhost:3001)

EXAMPLE WITH VARIABLE:
  BASE_URL=http://localhost:5000 npm run plugin:all

Reports are saved in ./reports/ folder
`);
}

main().catch(console.error);
