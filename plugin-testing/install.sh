#!/bin/bash

# Script de instalación e inicio del Testing Plugin

echo "╔════════════════════════════════════════════╗"
echo "║  🧪 Testing Plugin Setup                  ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Directorio base
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$BASE_DIR/src/ui"

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "Instálalo desde: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js encontrado: $NODE_VERSION"

# Crear directorios necesarios
echo ""
echo "📁 Creando directorios..."
mkdir -p "$BASE_DIR/db"
mkdir -p "$BASE_DIR/reports"
mkdir -p "$BASE_DIR/uploads"
echo "✅ Directorios creados (db, reports, uploads)"

# Instalar dependencias principales
echo ""
echo "📦 Instalando dependencias principales..."
cd "$BASE_DIR"
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error al instalar dependencias principales"
    exit 1
fi
echo "✅ Dependencias principales instaladas"

# Instalar dependencias de la UI
echo ""
echo "📦 Instalando dependencias de la UI..."
cd "$UI_DIR"
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error al instalar dependencias de la UI"
    exit 1
fi
echo "✅ Dependencias de la UI instaladas"

# Compilar React
echo ""
echo "⚛️  Compilando React..."
cd "$UI_DIR"
npm run react-build

if [ $? -ne 0 ]; then
    echo "❌ Error al compilar React"
    exit 1
fi
echo "✅ React compilado correctamente"

# Volver al directorio base
cd "$BASE_DIR"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  ✅ Setup completado                       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Función para limpiar procesos al salir
cleanup() {
    echo ""
    echo "→ Deteniendo servidor..."
    pkill -f "report-server.js" 2>/dev/null
    pkill -f "electron" 2>/dev/null
    exit 0
}

# Manejar Ctrl+C
trap cleanup SIGINT SIGTERM

# Iniciar el plugin
echo "🚀 Iniciando Testing Plugin..."
echo ""
echo "  → Aplicación Electron: Se abrirá automáticamente"
echo "  → Navegador web: http://localhost:3002"
echo ""
echo "Presiona Ctrl+C para detener"
echo ""

# Iniciar con Electron
cd "$BASE_DIR"
npm run ui:electron &
PLUGIN_PID=$!

# Mantener el script corriendo
wait $PLUGIN_PID
