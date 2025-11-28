#!/bin/bash

# Script para configurar los secrets de SMTP en Firebase Functions
# Uso: bash scripts/configurar-smtp-firebase.sh

echo "🔐 Configurando secrets de SMTP para Firebase Functions"
echo ""

# Verificar que Firebase CLI esté instalado
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI no está instalado"
    echo "Instálalo con: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI encontrado"
echo ""

# Verificar que esté logueado
echo "🔐 Verificando autenticación..."
firebase login --no-localhost

echo ""
echo "📋 Configurando secrets de SMTP..."
echo ""

# Configurar SMTP_HOST
echo "1️⃣ Configurando SMTP_HOST..."
echo "   Valor: smtp.gmail.com"
firebase functions:secrets:set SMTP_HOST <<< "smtp.gmail.com"

# Configurar SMTP_PORT
echo ""
echo "2️⃣ Configurando SMTP_PORT..."
echo "   Valor: 587"
firebase functions:secrets:set SMTP_PORT <<< "587"

# Configurar SMTP_USER
echo ""
echo "3️⃣ Configurando SMTP_USER..."
echo "   Valor: bry.hluna@gmail.com"
firebase functions:secrets:set SMTP_USER <<< "bry.hluna@gmail.com"

# Configurar SMTP_PASS
echo ""
echo "4️⃣ Configurando SMTP_PASS..."
echo "   Valor: qhfrxourruoqowuu (contraseña de aplicación sin espacios)"
firebase functions:secrets:set SMTP_PASS <<< "qhfrxourruoqowuu"

# Configurar SMTP_SECURE
echo ""
echo "5️⃣ Configurando SMTP_SECURE..."
echo "   Valor: false (para Gmail con puerto 587)"
firebase functions:secrets:set SMTP_SECURE <<< "false"

# Configurar SMTP_FROM
echo ""
echo "6️⃣ Configurando SMTP_FROM..."
echo "   Valor: AgroMarket <bry.hluna@gmail.com>"
firebase functions:secrets:set SMTP_FROM <<< "AgroMarket <bry.hluna@gmail.com>"

echo ""
echo "✅ Todos los secrets han sido configurados"
echo ""
echo "📦 Próximos pasos:"
echo "1. Instalar dependencias: cd functions && npm install"
echo "2. Desplegar funciones: firebase deploy --only functions"
echo ""

