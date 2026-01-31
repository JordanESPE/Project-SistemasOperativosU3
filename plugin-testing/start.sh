#!/bin/bash

# Script para iniciar automáticamente el Plugin de Testing
# Uso: ./start.sh

echo "========================================"
echo "   TESTING PLUGIN - AUTO START"
echo "========================================"
echo ""

# Directorio base
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ECOMMERCE_DIR="$BASE_DIR/../tienda-ecommerce"
UI_DIR="$BASE_DIR/src/ui"

# Función para matar procesos anteriores
cleanup() {
    echo "→ Limpiando procesos anteriores..."
    pkill -f "node.*server.js" 2>/dev/null
    pkill -f "node.*launcher.js" 2>/dev/null
    sleep 1
}

# Función para iniciar servidores
start_servers() {
    echo "→ Iniciando servidor e-commerce (puerto 3001)..."
    cd "$ECOMMERCE_DIR" && node src/backend/server.js &
    ECOMMERCE_PID=$!
    sleep 2

    echo "→ Iniciando servidor del plugin (puerto 3002)..."
    cd "$UI_DIR" && node launcher.js &
    PLUGIN_PID=$!
    
    echo ""
    echo "✓ Servidores iniciados correctamente"
    echo "  - E-commerce: http://localhost:3001"
    echo "  - Plugin UI:  http://localhost:3002"
    echo ""
    echo "Presiona Ctrl+C para detener los servidores"
}

# Manejar Ctrl+C para cerrar limpiamente
trap 'echo ""; echo "→ Deteniendo servidores..."; cleanup; exit 0' SIGINT SIGTERM

# Ejecutar
cleanup
start_servers

# Mantener el script corriendo
wait
