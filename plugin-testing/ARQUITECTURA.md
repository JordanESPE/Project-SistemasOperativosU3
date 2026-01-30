# ESTRUCTURA VISUAL DEL TESTING PLUGIN

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                    TESTING PLUGIN LINUX                         │
│                                                                 │
│  📦 ./dist/testing-plugin (48MB Executable)                   │
│     └─ Node.js 18 + All Dependencies (Self-Contained)         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │   Launcher Process (PID)      │
            │                               │
            │  • Initialize Database        │
            │  • Start Servers              │
            │  • Open Browser               │
            │  • Execute Tests              │
            └───────────────────────────────┘
                     │              │
         ┌───────────┘              └────────────┐
         ▼                                       ▼
    ┌─────────────┐                      ┌──────────────┐
    │  Express    │                      │  E-Commerce  │
    │   Server    │                      │    Server    │
    │  :3002      │                      │    :3001     │
    │  React UI   │                      │  Test Target │
    └─────────────┘                      └──────────────┘
         │
         ▼
    ┌─────────────────────────────────────┐
    │      Browser                        │
    │  http://localhost:3002              │
    │                                     │
    │  Dashboard with Charts              │
    │  Test Results Display               │
    │  PDF Export                         │
    └─────────────────────────────────────┘
```

## 📂 Estructura de Directorios

```
plugin-testing/
│
├── 📄 dist/
│   └── testing-plugin .......................... Ejecutable Linux (48MB)
│
├── 📄 src/
│   │
│   ├── plugin/ (Core Testing Engine)
│   │   ├── core/
│   │   │   ├── cli.js ......................... CLI Interface
│   │   │   │   • Parses arguments (--all, --functional, etc)
│   │   │   │   • Coordinates test execution
│   │   │   │
│   │   │   └── executor.js ................... Master Orchestrator
│   │   │       • Manages execution flow
│   │   │       • Aggregates results
│   │   │       • Generates reports
│   │   │
│   │   └── modules/ (Test Suites)
│   │       │
│   │       ├── functional-tests/
│   │       │   └── runner.js ............... User Workflow Tests
│   │       │       • Login/Authentication
│   │       │       • Product CRUD
│   │       │       • Cart Operations
│   │       │       • Order Creation
│   │       │       • Search Functionality
│   │       │
│   │       ├── non-functional-tests/
│   │       │   └── runner.js ............... Quality Attribute Tests
│   │       │       • Response Time
│   │       │       • Error Handling
│   │       │       • CORS Validation
│   │       │       • Data Validation
│   │       │       • Server Status
│   │       │
│   │       ├── load-stress-tests/
│   │       │   └── runner.js ............... Capacity Tests
│   │       │       • Load Testing (5 RPS)
│   │       │       • Stress Testing (Max Load)
│   │       │       • Break Point Detection
│   │       │       • Error Rate Analysis
│   │       │
│   │       └── report-generator/
│   │           └── generator.js ............ Report Formatting
│   │               • JSON Reports
│   │               • PDF Generation
│   │               • HTML Summaries
│   │               • Statistics
│   │
│   └── ui/ (User Interface)
│       ├── launcher.js ....................... Entry Point
│       │   • Initialize services
│       │   • Start e-commerce server
│       │   • Launch browser
│       │   • Run tests
│       │
│       ├── public/ (React Components)
│       │   ├── App.js ..................... Main Component
│       │   │   • Real-time polling
│       │   │   • Chart visualization
│       │   │   • PDF export
│       │   │
│       │   ├── App.css ................... Professional Styling
│       │   │   • Gradient design
│       │   │   • Responsive layout
│       │   │   • Animations
│       │   │
│       │   └── index.html ............... React Entry
│       │
│       ├── build/ (Compiled React)
│       │   ├── static/
│       │   │   ├── js/main.*.js (46.8 KB)
│       │   │   └── css/main.*.css (2.37 KB)
│       │   └── index.html
│       │
│       └── package.json
│           • react 18.2.0
│           • recharts (Charts)
│           • express (API)
│           • jspdf (PDF)
│
├── 📄 db/ (Local Storage)
│   └── [created at runtime] ........... SQLite Database
│
├── 📄 reports/ (Generated)
│   └── [created at runtime] ........... PDF Exports
│
├── package.json ........................... Main Dependencies
├── test-config.json ....................... Test Configuration
├── install.sh ............................. Installation Script
│
├── 📘 README.md ............................ Full Documentation
├── 📘 INSTALACION.md ....................... Installation Guide
└── 📘 USO.txt ............................. Quick Usage
```

## 🔄 Flujo de Datos

```
┌──────────────────────────────────────────────────────────────────┐
│                      USER INTERACTION                            │
│                  ./dist/testing-plugin                           │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │  1. INITIALIZATION PHASE          │
        │                                   │
        │  • Create ~/.testing-plugin/      │
        │  • Create db/ directory           │
        │  • Init reports.json (empty)      │
        │  • Load configuration             │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │  2. START SERVICES                │
        │                                   │
        │  • Start Express (3002)           │
        │  • Start E-commerce (3001)        │
        │  • Open Browser                   │
        │  • Ready for tests                │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────────────┐
        │  3. EXECUTE TEST SUITES (Sequential or Parallel)      │
        │                                                       │
        │  ┌─────────────────────────────────────────────────┐ │
        │  │  FUNCTIONAL TESTS (2-3s)                        │ │
        │  │  • Test 1: Health Check                         │ │
        │  │  • Test 2: Categories List                      │ │
        │  │  • Test 3: Product CRUD                         │ │
        │  │  • Test 4: User Auth                            │ │
        │  │  • Test 5: Cart Operations                      │ │
        │  └─────────────────────────────────────────────────┘ │
        │                    ↓                                  │
        │  ┌─────────────────────────────────────────────────┐ │
        │  │  NON-FUNCTIONAL TESTS (1-2s)                   │ │
        │  │  • Response Time Check                          │ │
        │  │  • Error Handling                               │ │
        │  │  • CORS Validation                              │ │
        │  │  • Data Validation                              │ │
        │  │  • Server Status                                │ │
        │  └─────────────────────────────────────────────────┘ │
        │                    ↓                                  │
        │  ┌─────────────────────────────────────────────────┐ │
        │  │  LOAD TESTS (5s)                               │ │
        │  │  • Sustained 5 RPS for 5 seconds                │ │
        │  │  • Measure response times                       │ │
        │  │  • Calculate success rate                       │ │
        │  └─────────────────────────────────────────────────┘ │
        │                    ↓                                  │
        │  ┌─────────────────────────────────────────────────┐ │
        │  │  STRESS TESTS (7+s)                            │ │
        │  │  • Escalate concurrent requests                 │ │
        │  │  • Find break point                             │ │
        │  │  • Measure degradation                          │ │
        │  │  • Calculate error rate                         │ │
        │  └─────────────────────────────────────────────────┘ │
        └───────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │  4. AGGREGATE RESULTS             │
        │                                   │
        │  • Compile all test results       │
        │  • Calculate statistics           │
        │  • Generate summary               │
        │  • Create detailed report         │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │  5. STORE IN DATABASE             │
        │                                   │
        │  ~/.testing-plugin/db/reports.json│
        │  [                                 │
        │    {                              │
        │      "timestamp": "...",          │
        │      "summary": {...},            │
        │      "details": [...]             │
        │    }                              │
        │  ]                                │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │  6. DISPLAY IN BROWSER            │
        │                                   │
        │  • Parse report data              │
        │  • Render charts (Recharts)       │
        │  • Show test details              │
        │  • Enable PDF export              │
        │  • Auto-refresh (2s polling)      │
        └───────────────────────────────────┘
```

## 📊 UI Components Hierarchy

```
App (Main Component)
│
├── Header Section
│   ├── Logo with Animation
│   └── Stats Cards (Total, Passed, Failed, Rate)
│
├── Main Dashboard
│   │
│   ├── Charts Section
│   │   ├── Pie Chart (Pass/Fail Distribution)
│   │   └── Bar Chart (Suite Performance)
│   │
│   ├── Suite Cards Grid
│   │   ├── Card (Functional Tests)
│   │   │   ├── Status Badge
│   │   │   ├── Statistics
│   │   │   └── Progress Bar
│   │   ├── Card (Non-Functional Tests)
│   │   ├── Card (Load Tests)
│   │   └── Card (Stress Tests)
│   │
│   ├── Detailed Results Section
│   │   └── Table
│   │       ├── Columns: Name, Status, Details
│   │       └── Rows: Individual Tests
│   │
│   └── Actions Section
│       ├── Export PDF Button
│       └── Generated Timestamp
```

## 🔐 Security & Data

```
Local Storage (No Cloud):
~/.testing-plugin/
├── db/
│   └── reports.json ........................ Local JSON
│       (Not uploaded anywhere)
│       (User has full control)
│
└── reports/
    └── test-report-*.pdf .................. Local PDFs
        (Not uploaded anywhere)
        (User has full control)

Database Format (JSON):
[
  {
    id: "UUID",
    timestamp: "ISO 8601",
    type: "COMPLETE_SUITE",
    summary: {
      tests: [...],
      overall: {
        totalTests: N,
        totalPassed: N,
        totalFailed: N
      }
    },
    details: [
      {
        type: "TEST_SUITE_NAME",
        summary: {...},
        details: [...]
      }
    ],
    created_at: "ISO 8601"
  }
]
```

## ⚡ Performance Metrics

```
Execution Time by Component:
├── Initialization ................ ~1s
│   └── Create dirs, load config
│
├── Start Services ................ ~2s
│   ├── Express startup
│   └── E-commerce startup
│
├── Tests ......................... ~15-20s
│   ├── Functional ............... 2-3s (50 tests)
│   ├── Non-Functional ........... 1-2s (5 tests)
│   ├── Load ..................... 5s (25 requests)
│   └── Stress ................... 7+s (variable)
│
├── Report Generation ............. ~1s
│   └── Aggregate + Format
│
└── Total ......................... ~20-25s

Memory Usage:
├── Executable ................... 48MB (on disk)
├── Runtime ...................... ~80-100MB
└── With Browser ................. ~150-200MB

Disk Space:
├── Executable ................... 48MB
├── Database per report .......... ~5-10KB
└── PDF per export ............... ~50-100KB
```

## 🎯 Key Features at a Glance

```
✅ Self-contained Linux executable
✅ Automatic test execution
✅ Real-time UI with charts
✅ Database storage (JSON)
✅ PDF export functionality
✅ Professional design
✅ Multi-module testing
✅ Zero configuration needed
✅ Cross-origin support
✅ Error handling & validation
✅ Performance metrics
✅ Load & stress testing
✅ 100% offline capable
✅ Responsive design
✅ Auto-refresh polling
```

---

**Documentación de Arquitectura v1.0**
*29 de Enero, 2026*
