# INSTALACIÓN Y USO - Testing Plugin para Linux

## 🚀 Inicio Rápido

### Opción 1: Ejecutable Directo (Recomendado)

```bash
# Ejecutar directamente el binario compilado
./dist/testing-plugin
```

**El plugin automáticamente:**
1. ✅ Inicia el servidor Express (puerto 3002)
2. ✅ Inicia el servidor de e-commerce (puerto 3001)  
3. ✅ Abre el navegador automáticamente
4. ✅ Ejecuta todas las pruebas
5. ✅ Guarda resultados en base de datos
6. ✅ Muestra resultados en la interfaz web

### Acceso a la Interfaz

- **URL**: `http://localhost:3002`
- **Datos**: `~/.testing-plugin/db/reports.json`

---

## 📋 Requisitos Previos

### Sistema
- **OS**: Linux x64
- **Puertos Disponibles**: 3001, 3002
- **RAM**: 100MB mínimo
- **Espacio Disco**: 50MB ejecutable + datos

### Dependencias
El ejecutable es **self-contained** (incluye Node.js 18)
- ✅ NO requiere Node.js instalado
- ✅ NO requiere npm instalado
- ✅ Solo requiere Linux x64

---

## 🔧 Instalación desde Código Fuente

Si necesitas recompilar desde código:

### 1. Instalar Dependencias
```bash
cd /home/jordan/Escritorio/PROYECTO\ P3\ OPERATIVOS/plugin-testing
npm install
```

### 2. Compilar React UI
```bash
cd src/ui
npm install
npm run react-build
cd ../..
```

### 3. Crear Ejecutable Linux
```bash
npx pkg src/ui/launcher.js \
  --output dist/testing-plugin \
  --target node18-linux-x64 \
  --compress Brotli
```

### 4. Ejecutar
```bash
./dist/testing-plugin
```

---

## 📊 Interfaz de Usuario

### Dashboard Principal
- **Header**: Estadísticas en tiempo real
  - Total de tests
  - Tests pasados
  - Tests fallidos
  - Tasa de éxito

### Gráficos Visuales
- **Pie Chart**: Distribución Pass/Fail
- **Bar Chart**: Resultados por suite de tests
- **Tarjetas de Suite**: Detalles por módulo

### Tabla Detallada
- Nombres de tests
- Estados (PASSED/FAILED)
- Detalles de errores
- Información de ejecución

### Exportar Resultados
- **Botón "Export PDF"**: Descarga reporte en PDF
- Incluye gráficos y estadísticas
- Timestamped automáticamente

---

## 🗂️ Estructura de Archivos

```
plugin-testing/
├── dist/
│   └── testing-plugin          # ← EJECUTABLE PRINCIPAL
├── src/
│   ├── plugin/
│   │   ├── core/              # Orquestador de tests
│   │   └── modules/           # Módulos de test
│   └── ui/
│       ├── launcher.js        # Punto de entrada
│       ├── public/            # Componentes React
│       └── build/             # Build compilado
├── README.md                   # Documentación completa
└── USO.txt                     # Instrucciones básicas
```

---

## 🧪 Módulos de Testing Incluidos

### 1. Functional Tests
Prueba funcionalidad del sistema:
- Login y autenticación
- Gestión de productos
- Operaciones de carrito
- Creación de órdenes
- Búsqueda de productos

### 2. Non-Functional Tests
Valida atributos de calidad:
- Tiempo de respuesta
- Manejo de errores
- Validación CORS
- Integridad de datos

### 3. Load Tests
Prueba capacidad bajo carga:
- Carga sostenida
- Múltiples solicitudes
- Análisis de tasa de error

### 4. Stress Tests
Encuentra límites del sistema:
- Solicitudes concurrentes
- Punto de quiebre
- Degradación graciosa

---

## 💾 Base de Datos

### Ubicación
```
~/.testing-plugin/
├── db/
│   └── reports.json           # Base de datos de reportes
└── reports/
    └── test-report-*.pdf      # Reportes PDF exportados
```

### Formato JSON
```json
[
  {
    "timestamp": "2026-01-30T03:41:35.600Z",
    "type": "COMPLETE_SUITE",
    "summary": {
      "tests": [...],
      "overall": {...}
    },
    "details": [...],
    "generatedAt": "29/1/2026, 15:30:00"
  }
]
```

### Limpiar Base de Datos
```bash
rm -rf ~/.testing-plugin/db/reports.json
# La siguiente ejecución reinicializará
```

---

## 🌐 APIs REST Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/latest-report` | Obtener último reporte |
| GET | `/api/reports` | Listar todos los reportes |
| POST | `/api/export-pdf` | Generar PDF |
| POST | `/api/save-report` | Guardar reporte personalizado |

### Ejemplo: Obtener Reportes
```bash
curl http://localhost:3002/api/latest-report | jq '.'
```

---

## 🔍 Solución de Problemas

### Puerto ya en uso
```bash
# Encontrar proceso usando puerto 3002
lsof -i :3002

# Matar proceso
kill -9 <PID>

# Reiniciar plugin
./dist/testing-plugin
```

### Browser no se abre automáticamente
```bash
# Abrir manualmente
xdg-open http://localhost:3002
```

### Servidor de e-commerce no inicia
```bash
# Verificar que tienda-ecommerce está disponible
ls -la /home/jordan/Escritorio/PROYECTO\ P3\ OPERATIVOS/tienda-ecommerce

# Verificar puerto 3001
lsof -i :3001
```

### Base de datos corrupta
```bash
# Resetear completamente
rm -rf ~/.testing-plugin
./dist/testing-plugin
# Se recreará automáticamente
```

---

## 📈 Interpretación de Resultados

### Success Rate
- **≥80%**: ✅ Aceptable
- **60-79%**: ⚠️ Revisar
- **<60%**: ❌ Requiere atención

### Test Status
- **PASSED**: Test exitoso
- **FAILED**: Error detectado
- **N/A**: No ejecutado

### Duración Típica
- Functional: 2-3s
- Non-Functional: 1-2s
- Load: 5+s
- Stress: 7+s

---

## ⚙️ Configuración Avanzada

### Variables de Entorno
```bash
# Editar .env
PORT=3002
DATABASE_URL=~/.testing-plugin/db/reports.json
```

### Test Configuration
```json
// test-config.json
{
  "functional": { "enabled": true },
  "load": { "rps": 5, "duration": 5 },
  "stress": { "max_concurrent": 500 }
}
```

---

## 🎯 Flujo de Ejecución

```
1. Iniciar Plugin
   └─ Crear directorios de datos

2. Iniciar Servidores
   ├─ Express (3002) → UI
   └─ E-commerce (3001) → Target

3. Abrir Navegador
   └─ http://localhost:3002

4. Ejecutar Tests
   ├─ Funcionales
   ├─ No-funcionales
   ├─ Carga
   └─ Estrés

5. Guardar Resultados
   └─ ~/.testing-plugin/db/reports.json

6. Mostrar en UI
   ├─ Gráficos
   ├─ Tablas
   └─ Exportar PDF
```

---

## 📞 Soporte

Para problemas específicos:

1. **Revisar logs**:
   ```bash
   ps aux | grep testing-plugin
   ```

2. **Verificar conectividad**:
   ```bash
   curl http://localhost:3002
   curl http://localhost:3001/api/health
   ```

3. **Limpiar y reiniciar**:
   ```bash
   pkill -f testing-plugin
   rm -rf ~/.testing-plugin
   ./dist/testing-plugin
   ```

---

## ✅ Verificación de Instalación

```bash
# 1. Executable exists
test -f ./dist/testing-plugin && echo "✓ Executable found"

# 2. Ports available
(echo >/dev/tcp/localhost/3002) 2>/dev/null || echo "✓ Port 3002 available"
(echo >/dev/tcp/localhost/3001) 2>/dev/null || echo "✓ Port 3001 available"

# 3. Execute
./dist/testing-plugin
```

Si todo está en verde, ¡estás listo! 🚀

---

**Última actualización**: 29 de Enero, 2026
**Versión**: 1.0 - Linux Solo (x64)
