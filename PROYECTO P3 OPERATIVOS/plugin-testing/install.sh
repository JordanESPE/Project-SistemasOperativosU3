#!/bin/bash

# Script de instalación y primer inicio

echo "╔════════════════════════════════════════════╗"
echo "║  🧪 Testing Plugin Setup                  ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "Instálalo desde: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js encontrado: $NODE_VERSION"

# Instalar dependencias
echo ""
echo "📦 Instalando dependencias..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error al instalar dependencias"
    exit 1
fi

echo "✅ Dependencias instaladas"

# Crear directorios necesarios
echo ""
echo "📁 Creando directorios..."
mkdir -p db
mkdir -p reports
echo "✅ Directorios creados"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  ✅ Setup completado                       ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "Próximos pasos:"
echo ""
echo "1. Inicia el servidor:"
echo "   npm start"
echo ""
echo "2. En otra terminal, ejecuta las pruebas:"
echo "   npm run plugin:all"
echo ""
echo "3. Abre el navegador en: http://localhost:3000"
echo ""
echo "Para más información: npm run plugin:help"
echo ""
