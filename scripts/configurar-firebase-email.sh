#!/bin/bash

# Script para configurar Firebase Extensions para envío de correos con Gmail
# Uso: ./scripts/configurar-firebase-email.sh

echo "🚀 Configurando Firebase Extensions para envío de correos con Gmail"
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
echo "📋 Pasos para configurar:"
echo ""
echo "1. Obtén tu contraseña de aplicación de Gmail:"
echo "   - Ve a: https://myaccount.google.com/apppasswords"
echo "   - Genera una contraseña para 'Correo' y 'Otro (AgroMarket)'"
echo "   - Copia la contraseña de 16 caracteres"
echo ""
echo "2. Instala la extensión Trigger Email:"
echo "   firebase ext:install firestore-send-email"
echo ""
echo "3. Durante la instalación, configura:"
echo "   - SMTP connection URI: smtps://TU_EMAIL:TU_CONTRASEÑA_APP@smtp.gmail.com:465"
echo "   - Email documents collection: mail"
echo "   - Default FROM: AgroMarket <TU_EMAIL@gmail.com>"
echo "   - Default REPLY-TO: TU_EMAIL@gmail.com"
echo ""
echo "4. O instala desde la consola de Firebase:"
echo "   https://console.firebase.google.com/project/TU_PROYECTO/extensions"
echo ""

read -p "¿Quieres instalar la extensión ahora? (s/n): " respuesta

if [[ $respuesta =~ ^[Ss]$ ]]; then
    echo ""
    echo "Instalando extensión..."
    firebase ext:install firestore-send-email
    echo ""
    echo "✅ Extensión instalada. Ahora configura los parámetros SMTP con tu información de Gmail."
else
    echo ""
    echo "Puedes instalar la extensión más tarde con:"
    echo "firebase ext:install firestore-send-email"
fi

echo ""
echo "📚 Para más información, consulta: FIREBASE_EMAIL_SETUP.md"

