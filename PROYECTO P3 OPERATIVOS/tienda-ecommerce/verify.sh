#!/bin/bash
# Script de Verificación - Ejecuta esto después de npm install

echo "╔════════════════════════════════════════════════════════╗"
echo "║     ✅ VERIFICACIÓN DE TIENDA E-COMMERCE              ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de verificaciones
PASSED=0
FAILED=0

# 1. Verificar archivos
echo "📁 Verificando archivos..."
files=("package.json" ".env" ".gitignore" "src/backend/db.js" "src/backend/server.js" "src/frontend/index.html" "README.md" "TESTING.md")

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $file FALTA"
        ((FAILED++))
    fi
done

echo ""

# 2. Verificar Node.js
echo "🔧 Verificando Node.js..."
if command -v node &> /dev/null; then
    version=$(node -v)
    echo -e "  ${GREEN}✓${NC} Node.js $version"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} Node.js NO instalado"
    ((FAILED++))
fi

# 3. Verificar npm
echo "🔧 Verificando npm..."
if command -v npm &> /dev/null; then
    version=$(npm -v)
    echo -e "  ${GREEN}✓${NC} npm $version"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} npm NO instalado"
    ((FAILED++))
fi

echo ""

# 4. Verificar dependencias
echo "📦 Verificando dependencias..."
if [ -d "node_modules" ]; then
    echo -e "  ${GREEN}✓${NC} node_modules encontrado"
    ((PASSED++))
else
    echo -e "  ${YELLOW}⚠${NC} node_modules NO encontrado"
    echo "    Ejecuta: npm install"
    ((FAILED++))
fi

echo ""

# 5. Verificar sintaxis JavaScript
echo "📝 Verificando sintaxis JavaScript..."
for file in "src/backend/server.js" "src/backend/db.js"; do
    if node -c "$file" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $file"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} $file tiene errores"
        ((FAILED++))
    fi
done

echo ""

# 6. Verificar configuración
echo "⚙️  Verificando configuración..."
if [ -f ".env" ]; then
    if grep -q "PORT=3001" ".env"; then
        echo -e "  ${GREEN}✓${NC} PORT configurado en 3001"
        ((PASSED++))
    else
        echo -e "  ${RED}✗${NC} PORT no configurado"
        ((FAILED++))
    fi
else
    echo -e "  ${RED}✗${NC} .env no encontrado"
    ((FAILED++))
fi

echo ""

# 7. Verificar package.json
echo "📋 Verificando package.json..."
if grep -q "express" "package.json"; then
    echo -e "  ${GREEN}✓${NC} express está en dependencias"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} express falta en dependencias"
    ((FAILED++))
fi

if grep -q "sqlite3" "package.json"; then
    echo -e "  ${GREEN}✓${NC} sqlite3 está en dependencias"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} sqlite3 falta en dependencias"
    ((FAILED++))
fi

echo ""

# 8. Resumen
echo "╔════════════════════════════════════════════════════════╗"
echo "║               RESUMEN DE VERIFICACIÓN                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "  ${GREEN}Pasadas: $PASSED${NC}"
echo -e "  ${RED}Fallidas: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ TODO ESTÁ LISTO!${NC}"
    echo ""
    echo "Próximo paso:"
    echo "  npm start"
    echo ""
    echo "Luego abre: http://localhost:3001"
    exit 0
else
    echo -e "${YELLOW}⚠️  Hay cosas por verificar${NC}"
    echo ""
    echo "Si es la primera vez:"
    echo "  npm install"
    echo ""
    echo "Luego ejecuta este script nuevamente:"
    echo "  bash verify.sh"
    exit 1
fi
