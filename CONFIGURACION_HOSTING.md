# 📧 Guía de Configuración de Correos en Hosting

## ⚠️ Problema Común

Cuando subes la aplicación a un hosting, los correos no funcionan porque:
1. Las variables de entorno no están configuradas
2. Gmail bloquea conexiones desde nuevas IPs/hostings
3. Los puertos SMTP pueden estar bloqueados

## 🔧 Solución: Configurar Variables de Entorno

### Para Railway

1. Ve a tu proyecto en Railway
2. Click en tu servicio
3. Ve a la pestaña **Variables**
4. Agrega las siguientes variables:

```
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=agromarket559@gmail.com
MAIL_PASSWORD=xnzf mxvp vjbi iioj
MAIL_DEFAULT_SENDER=AgroMarket <agromarket559@gmail.com>
```

### Para Heroku

```bash
heroku config:set MAIL_SERVER=smtp.gmail.com
heroku config:set MAIL_PORT=587
heroku config:set MAIL_USE_TLS=true
heroku config:set MAIL_USERNAME=agromarket559@gmail.com
heroku config:set MAIL_PASSWORD="xnzf mxvp vjbi iioj"
heroku config:set MAIL_DEFAULT_SENDER="AgroMarket <agromarket559@gmail.com>"
```

### Para Render

1. Ve a tu servicio en Render
2. Ve a **Environment**
3. Agrega las variables:

```
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=agromarket559@gmail.com
MAIL_PASSWORD=xnzf mxvp vjbi iioj
MAIL_DEFAULT_SENDER=AgroMarket <agromarket559@gmail.com>
```

### Para otros hostings (cPanel, VPS, etc.)

Crea un archivo `.env` en la raíz del proyecto (o configura variables de entorno según tu hosting):

```env
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=agromarket559@gmail.com
MAIL_PASSWORD=xnzf mxvp vjbi iioj
MAIL_DEFAULT_SENDER=AgroMarket <agromarket559@gmail.com>
FLASK_ENV=production
```

## 🔐 Configuración de Gmail

### 1. Generar Contraseña de Aplicación

1. Ve a tu cuenta de Google: https://myaccount.google.com/
2. Ve a **Seguridad** → **Verificación en 2 pasos** (debe estar activada)
3. Busca **Contraseñas de aplicaciones**
4. Genera una nueva contraseña para "Correo" y "Otro (personalizado)" → "AgroMarket"
5. Copia la contraseña de 16 caracteres (sin espacios)

### 2. Permitir Acceso de Apps Menos Seguras (NO RECOMENDADO)

Si prefieres no usar contraseña de aplicación:
1. Ve a: https://myaccount.google.com/lesssecureapps
2. Activa el acceso
3. ⚠️ Esto es menos seguro, mejor usa contraseña de aplicación

## 🚨 Problemas Comunes y Soluciones

### Error: "Authentication failed" o "535"

**Causa:** Contraseña incorrecta o contraseña de aplicación no configurada

**Solución:**
- Verifica que estés usando una **Contraseña de aplicación**, no tu contraseña normal
- Regenera la contraseña de aplicación en Google
- Asegúrate de copiar la contraseña sin espacios en la variable de entorno

### Error: "Connection timeout" o "Could not connect"

**Causa:** Puerto bloqueado o firewall

**Solución:**
- Verifica que el hosting permita conexiones salientes al puerto 587
- Algunos hostings bloquean SMTP - verifica con soporte
- Si usas VPS, verifica firewall: `sudo ufw allow 587/tcp`

### Error: "Gmail bloquea la conexión"

**Causa:** Gmail detecta actividad sospechosa desde nueva IP

**Solución:**
1. Ve a: https://accounts.google.com/DisplayUnlockCaptcha
2. Haz click en "Continuar"
3. Intenta enviar correo nuevamente
4. Si persiste, espera 24 horas y vuelve a intentar

### Correos van a spam

**Solución:**
- Configura SPF en tu dominio (si usas dominio propio)
- Usa un servicio de email transaccional (SendGrid, Mailgun, AWS SES)
- Verifica que `MAIL_DEFAULT_SENDER` tenga formato correcto: `Nombre <email@domain.com>`

## 📊 Verificar Configuración

Para verificar que todo está bien configurado, agrega esta ruta temporal de diagnóstico:

```python
@app.route("/debug/email-config")
def debug_email_config():
    """Ruta de diagnóstico - ELIMINAR EN PRODUCCIÓN"""
    config_info = {
        'MAIL_SERVER': app.config.get('MAIL_SERVER'),
        'MAIL_PORT': app.config.get('MAIL_PORT'),
        'MAIL_USE_TLS': app.config.get('MAIL_USE_TLS'),
        'MAIL_USERNAME': app.config.get('MAIL_USERNAME'),
        'MAIL_PASSWORD': '***' if app.config.get('MAIL_PASSWORD') else 'NO CONFIGURADA',
        'MAIL_DEFAULT_SENDER': app.config.get('MAIL_DEFAULT_SENDER'),
        'Flask-Mail configurado': 'mail' in app.extensions,
    }
    return jsonify(config_info)
```

## ✅ Checklist Pre-Deploy

- [ ] Variables de entorno configuradas en el hosting
- [ ] Contraseña de aplicación de Gmail generada
- [ ] `MAIL_PASSWORD` configurada correctamente (sin espacios extra)
- [ ] `MAIL_USERNAME` configurado
- [ ] `MAIL_DEFAULT_SENDER` con formato correcto
- [ ] Puerto 587 permitido en el hosting
- [ ] Probar envío de correo después del deploy

## 🔄 Alternativas a Gmail SMTP

Si Gmail sigue dando problemas, considera:

### 1. SendGrid (Gratis hasta 100 emails/día)
```python
MAIL_SERVER=smtp.sendgrid.net
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=TU_API_KEY_SENDGRID
```

### 2. Mailgun
```python
MAIL_SERVER=smtp.mailgun.org
MAIL_PORT=587
MAIL_USERNAME=TU_USUARIO_MAILGUN
MAIL_PASSWORD=TU_PASSWORD_MAILGUN
```

### 3. AWS SES
```python
MAIL_SERVER=email-smtp.REGION.amazonaws.com
MAIL_PORT=587
MAIL_USERNAME=TU_ACCESS_KEY
MAIL_PASSWORD=TU_SECRET_KEY
```

## 📞 Soporte

Si después de seguir esta guía los correos no funcionan:
1. Revisa los logs del hosting para ver el error exacto
2. Verifica que todas las variables de entorno estén configuradas
3. Prueba el script `test_email.py` en el servidor si tienes acceso SSH

