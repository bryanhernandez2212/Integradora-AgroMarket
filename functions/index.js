const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
const {promisify} = require('util');

// Definir secrets
const smtpHost = defineSecret('SMTP_HOST');
const smtpPort = defineSecret('SMTP_PORT');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const smtpSecure = defineSecret('SMTP_SECURE');
const smtpFrom = defineSecret('SMTP_FROM');

// Inicializar Firebase Admin
admin.initializeApp();

/**
 * Obtener configuración SMTP desde secrets
 */
function getSMTPConfig() {
  return {
    host: smtpHost.value() || process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(smtpPort.value() || process.env.SMTP_PORT || '587'),
    secure: (smtpSecure.value() || process.env.SMTP_SECURE) === 'true',
    auth: {
      user: smtpUser.value() || process.env.SMTP_USER,
      pass: smtpPass.value() || process.env.SMTP_PASS,
    },
    from: smtpFrom.value() || process.env.SMTP_FROM || smtpUser.value() || process.env.SMTP_USER,
  };
}

/**
 * Crear transporter de Nodemailer
 */
/**
 * Crear transporter de Nodemailer con resolución DNS mejorada
 */
async function createTransporter() {
  const config = getSMTPConfig();
  
  // Para Firebase Functions, el error "queryA EBADNAME smtp.gmail.com" 
  // indica un problema de resolución DNS. Usar IPs directas de Gmail como fallback:
  
  // IPs conocidas de Gmail SMTP (pueden cambiar, pero son estables)
  const gmailIPs = [
    '74.125.200.108',  // smtp.gmail.com IP común
    '74.125.200.109',
    '173.194.76.108',
    '173.194.76.109'
  ];
  
  let resolvedHost = config.host;
  let useDirectIP = false;
  
  // Si es Gmail y hay problemas de DNS, usar IP directa
  if (config.host === 'smtp.gmail.com' || config.host.includes('gmail.com')) {
    try {
      console.log(`🔍 Intentando resolver DNS para ${config.host}...`);
      const lookup = promisify(dns.lookup);
      // Intentar con timeout de 5 segundos
      const result = await Promise.race([
        lookup(config.host, {family: 4}),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('DNS lookup timeout')), 5000)
        )
      ]);
      resolvedHost = result.address;
      console.log(`✅ DNS resuelto: ${config.host} -> ${resolvedHost}`);
    } catch (dnsError) {
      console.warn(`⚠️ No se pudo resolver DNS para ${config.host}:`, dnsError.message);
      console.warn('⚠️ Usando IP directa de Gmail como fallback...');
      // Usar primera IP de Gmail como fallback
      resolvedHost = gmailIPs[0];
      useDirectIP = true;
      console.log(`✅ Usando IP directa: ${resolvedHost}`);
    }
  }
  
  const transportConfig = {
    host: resolvedHost,
    port: config.port,
    secure: config.port === 465, // true solo para puerto 465 (SSL)
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
    // Configuración para resolver problemas de DNS en Firebase Functions
    tls: {
      rejectUnauthorized: false, // Permitir certificados para evitar problemas en producción
      minVersion: 'TLSv1.2',
      servername: config.host // Usar el hostname original para SNI, no la IP
    },
    // Si usamos IP directa, deshabilitar verificación de hostname
    ...(useDirectIP ? {
      name: config.host, // Nombre del servidor para verificación TLS
      host: resolvedHost // IP directa
    } : {}),
    // Timeouts aumentados para conexiones lentas
    connectionTimeout: 20000, // 20 segundos
    greetingTimeout: 10000, // 10 segundos  
    socketTimeout: 20000, // 20 segundos
    // Lookup personalizado - usar familia IPv4 con fallback robusto
    lookup: (hostname, options, callback) => {
      // Si ya estamos usando IP directa, no hacer lookup
      if (useDirectIP && resolvedHost) {
        console.log(`✅ Usando IP directa para lookup: ${resolvedHost}`);
        return callback(null, resolvedHost, 4);
      }
      
      // Intentar lookup con IPv4
      dns.lookup(hostname, {family: 4, hints: dns.ADDRCONFIG}, (err, address, family) => {
        if (err) {
          console.warn(`⚠️ Error en lookup DNS para ${hostname}:`, err.message);
          // Si es Gmail y falla, usar IP directa
          if (hostname === 'smtp.gmail.com' || hostname.includes('gmail.com')) {
            const gmailIP = '74.125.200.108';
            console.log(`✅ Usando IP directa de Gmail como fallback: ${gmailIP}`);
            return callback(null, gmailIP, 4);
          }
          // Fallback: intentar con cualquier familia
          return dns.lookup(hostname, {family: 0}, callback);
        }
        callback(err, address, family);
      });
    }
  };
  
  // Configuración específica para puerto 587 (STARTTLS)
  if (config.port === 587) {
    transportConfig.requireTLS = true;
    transportConfig.secure = false;
  }
  
  // Configuración específica para puerto 465 (SSL directo)
  if (config.port === 465) {
    transportConfig.secure = true;
  }
  
  console.log(`📧 Configurando Nodemailer: host=${resolvedHost} (${config.host}), port=${config.port}, secure=${transportConfig.secure}`);
  
  try {
    return nodemailer.createTransport(transportConfig);
  } catch (error) {
    console.error('❌ Error creando transporter:', error);
    throw error;
  }
}

/**
 * Cargar template HTML y reemplazar variables
 */
function loadTemplate(templateName, variables) {
  const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template no encontrado: ${templateName}`);
  }
  
  let html = fs.readFileSync(templatePath, 'utf8');
  
  // Reemplazar variables {{variable}}
  Object.keys(variables).forEach((key) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, variables[key] || '');
  });
  
  // Reemplazar año si no se proporcionó
  if (!variables.year) {
    html = html.replace(/\{\{year\}\}/g, new Date().getFullYear().toString());
  }
  
  return html;
}

/**
 * Enviar correo de solicitud de vendedor aprobada
 */
exports.sendSellerApprovalEmail = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
    timeoutSeconds: 60, // Timeout de 60 segundos para permitir resolución DNS y conexión SMTP
    maxInstances: 10, // Máximo de instancias concurrentes
  },
  async (request) => {
    console.log('='.repeat(80));
    console.log('✅ FIREBASE FUNCTION: sendSellerApprovalEmail - INICIANDO');
    console.log('='.repeat(80));
    console.log('📥 Datos recibidos:', JSON.stringify({
      email: request.data?.email,
      nombre: request.data?.nombre,
      nombreTienda: request.data?.nombreTienda,
      ubicacion: request.data?.ubicacion
    }, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      const { email, nombre, nombreTienda, ubicacion } = request.data;
      
      if (!email || !nombre) {
        console.error('❌ Validación falló: Email y nombre son requeridos');
        throw new HttpsError(
          'invalid-argument',
          'Email y nombre son requeridos'
        );
      }
      
      console.log('✅ Validación exitosa');
      console.log(`📧 Email: ${email}`);
      console.log(`👤 Nombre: ${nombre}`);
      console.log(`🏪 Tienda: ${nombreTienda || 'N/A'}`);
      console.log(`📍 Ubicación: ${ubicacion || 'N/A'}`);
      
      const config = getSMTPConfig();
      console.log('📧 Configuración SMTP obtenida');
      
      // Crear transporter con manejo mejorado de errores DNS
      let transporter;
      try {
        transporter = await createTransporter();
        console.log('✅ Transporter creado exitosamente');
      } catch (transporterError) {
        console.error('❌ Error creando transporter:', transporterError);
        // Si el error es de DNS, intentar con IP directa
        if (transporterError.message && transporterError.message.includes('EBADNAME')) {
          console.warn('⚠️ Error DNS detectado, intentando con IP directa...');
          // Forzar uso de IP directa
          const gmailIP = '74.125.200.108';
          const directConfig = {
            host: gmailIP,
            port: config.port,
            secure: config.port === 465,
            auth: config.auth,
            tls: {
              rejectUnauthorized: false,
              servername: 'smtp.gmail.com'
            }
          };
          transporter = nodemailer.createTransport(directConfig);
          console.log('✅ Transporter creado con IP directa');
        } else {
          throw transporterError;
        }
      }
    
      const html = loadTemplate('solicitud-vendedor-aprobada', {
        nombre: nombre,
        nombre_tienda: nombreTienda || '',
        ubicacion: ubicacion || '',
        email: email,
        year: new Date().getFullYear().toString(),
      });
      
      const mailOptions = {
        from: config.from,
        to: email,
        subject: '✅ Solicitud de Vendedor Aprobada - AgroMarket',
        html: html,
        text: `Hola ${nombre},\n\nTu solicitud para ser vendedor en AgroMarket ha sido aprobada.\n\nNombre de tienda: ${nombreTienda || ''}\nUbicación: ${ubicacion || ''}\n\nAhora puedes acceder a tu panel de vendedor y comenzar a publicar productos.\n\n¡Bienvenido a AgroMarket!`,
      };
      
      console.log('📤 Enviando correo con Nodemailer...');
      console.log('   From:', mailOptions.from);
      console.log('   To:', mailOptions.to);
      console.log('   Subject:', mailOptions.subject);
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log('='.repeat(80));
      console.log('✅ CORREO DE APROBACIÓN ENVIADO EXITOSAMENTE');
      console.log('='.repeat(80));
      console.log('📧 Email destinatario:', email);
      console.log('👤 Nombre:', nombre);
      console.log('📨 Message ID:', info.messageId);
      console.log('📧 Response:', info.response);
      console.log('⏰ Timestamp:', new Date().toISOString());
      console.log('='.repeat(80));
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.error('='.repeat(80));
      console.error('❌ ERROR ENVIANDO CORREO DE APROBACIÓN');
      console.error('='.repeat(80));
      console.error('📧 Email:', request.data?.email);
      console.error('❌ Tipo de error:', error.constructor.name);
      console.error('❌ Mensaje:', error.message);
      console.error('❌ Stack:', error.stack);
      
      // Si es un error de DNS, proporcionar mensaje más específico
      if (error.message && (error.message.includes('EBADNAME') || error.message.includes('queryA'))) {
        console.error('⚠️ Error de DNS detectado, esto puede indicar un problema de red en Firebase Functions');
        throw new HttpsError(
          'internal',
          'Error de conexión DNS al servidor de correo. Por favor, intenta nuevamente más tarde.'
        );
      }
      
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

/**
 * Enviar correo de solicitud de vendedor rechazada
 */
exports.sendSellerRejectionEmail = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
    timeoutSeconds: 60, // Timeout de 60 segundos para permitir resolución DNS y conexión SMTP
    maxInstances: 10, // Máximo de instancias concurrentes
  },
  async (request) => {
    console.log('='.repeat(80));
    console.log('❌ FIREBASE FUNCTION: sendSellerRejectionEmail - INICIANDO');
    console.log('='.repeat(80));
    console.log('📥 Datos recibidos:', JSON.stringify({
      email: request.data?.email,
      nombre: request.data?.nombre,
      motivoRechazo: request.data?.motivoRechazo ? '***' : null
    }, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      const { email, nombre, motivoRechazo } = request.data;
      
      if (!email || !nombre) {
        console.error('❌ Validación falló: Email y nombre son requeridos');
        throw new HttpsError(
          'invalid-argument',
          'Email y nombre son requeridos'
        );
      }
      
      console.log('✅ Validación exitosa');
      console.log(`📧 Email: ${email}`);
      console.log(`👤 Nombre: ${nombre}`);
      console.log(`📝 Motivo: ${motivoRechazo ? 'Proporcionado' : 'N/A'}`);
      
      const config = getSMTPConfig();
      console.log('📧 Configuración SMTP obtenida');
      
      // Crear transporter con manejo mejorado de errores DNS
      let transporter;
      try {
        transporter = await createTransporter();
        console.log('✅ Transporter creado exitosamente');
      } catch (transporterError) {
        console.error('❌ Error creando transporter:', transporterError);
        // Si el error es de DNS, intentar con IP directa
        if (transporterError.message && transporterError.message.includes('EBADNAME')) {
          console.warn('⚠️ Error DNS detectado, intentando con IP directa...');
          // Forzar uso de IP directa
          const gmailIP = '74.125.200.108';
          const directConfig = {
            host: gmailIP,
            port: config.port,
            secure: config.port === 465,
            auth: config.auth,
            tls: {
              rejectUnauthorized: false,
              servername: 'smtp.gmail.com'
            }
          };
          transporter = nodemailer.createTransport(directConfig);
          console.log('✅ Transporter creado con IP directa');
        } else {
          throw transporterError;
        }
      }
      
      let html = loadTemplate('solicitud-vendedor-rechazada', {
        nombre: nombre,
        motivo_rechazo: motivoRechazo || 'No se proporcionó un motivo específico.',
        year: new Date().getFullYear().toString(),
      });
      
      // Si no hay motivo, remover la sección de motivo
      if (!motivoRechazo) {
        html = html.replace(/{{#if motivo_rechazo}}[\s\S]*?{{\/if}}/g, '');
      }
      
      const mailOptions = {
        from: config.from,
        to: email,
        subject: '⚠️ Solicitud de Vendedor Rechazada - AgroMarket',
        html: html,
        text: `Hola ${nombre},\n\nLamentamos informarte que tu solicitud para ser vendedor en AgroMarket no ha sido aprobada en esta ocasión.\n\n${motivoRechazo ? `Motivo: ${motivoRechazo}\n\n` : ''}Si deseas volver a intentar, puedes crear una nueva solicitud desde tu perfil.\n\nGracias por tu interés en AgroMarket.`,
      };
      
      console.log('📤 Enviando correo con Nodemailer...');
      console.log('   From:', mailOptions.from);
      console.log('   To:', mailOptions.to);
      console.log('   Subject:', mailOptions.subject);
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log('='.repeat(80));
      console.log('✅ CORREO DE RECHAZO ENVIADO EXITOSAMENTE');
      console.log('='.repeat(80));
      console.log('📧 Email destinatario:', email);
      console.log('👤 Nombre:', nombre);
      console.log('📨 Message ID:', info.messageId);
      console.log('📧 Response:', info.response);
      console.log('⏰ Timestamp:', new Date().toISOString());
      console.log('='.repeat(80));
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.error('='.repeat(80));
      console.error('❌ ERROR ENVIANDO CORREO DE RECHAZO');
      console.error('='.repeat(80));
      console.error('📧 Email:', request.data?.email);
      console.error('❌ Tipo de error:', error.constructor.name);
      console.error('❌ Mensaje:', error.message);
      console.error('❌ Stack:', error.stack);
      
      // Si es un error de DNS, proporcionar mensaje más específico
      if (error.message && (error.message.includes('EBADNAME') || error.message.includes('queryA'))) {
        console.error('⚠️ Error de DNS detectado, esto puede indicar un problema de red en Firebase Functions');
        throw new HttpsError(
          'internal',
          'Error de conexión DNS al servidor de correo. Por favor, intenta nuevamente más tarde.'
        );
      }
      
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

/**
 * Enviar correo de confirmación de solicitud recibida
 */
exports.sendSellerPendingEmail = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
  },
  async (request) => {
    try {
      const { email, nombre, nombreTienda, ubicacion } = request.data;
      
      if (!email || !nombre) {
        throw new HttpsError(
          'invalid-argument',
          'Email y nombre son requeridos'
        );
      }
      
      const config = getSMTPConfig();
      const transporter = await createTransporter();
      
      const html = loadTemplate('solicitud-vendedor-pendiente', {
        nombre: nombre,
        nombre_tienda: nombreTienda || '',
        ubicacion: ubicacion || '',
        fecha_solicitud: new Date().toLocaleDateString('es-MX'),
        year: new Date().getFullYear().toString(),
      });
      
      const mailOptions = {
        from: config.from,
        to: email,
        subject: '⏳ Solicitud de Vendedor Recibida - AgroMarket',
        html: html,
        text: `Hola ${nombre},\n\nHemos recibido tu solicitud para ser vendedor en AgroMarket.\n\nNombre de tienda: ${nombreTienda || ''}\nUbicación: ${ubicacion || ''}\n\nTu solicitud está siendo revisada por nuestro equipo. Te notificaremos cuando se complete la revisión.\n\nEl proceso generalmente toma entre 1 a 3 días hábiles.`,
      };
      
      const info = await transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Error enviando correo de confirmación:', error);
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

/**
 * Enviar código de recuperación de contraseña
 */
exports.sendPasswordResetCode = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
    timeoutSeconds: 60, // Timeout de 60 segundos para permitir resolución DNS y conexión SMTP
    maxInstances: 10, // Máximo de instancias concurrentes
  },
  async (request) => {
    console.log('='.repeat(80));
    console.log('🔐 FIREBASE FUNCTION: sendPasswordResetCode - INICIANDO');
    console.log('='.repeat(80));
    console.log('📥 Datos recibidos:', JSON.stringify({
      email: request.data?.email,
      code: request.data?.code ? '***' : null,
      nombre: request.data?.nombre
    }, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      const { email, code, nombre } = request.data;
      
      if (!email || !code) {
        console.error('❌ Validación falló: Email y código son requeridos');
        throw new HttpsError(
          'invalid-argument',
          'Email y código son requeridos'
        );
      }
      
      console.log('✅ Validación exitosa');
      console.log(`📧 Email: ${email}`);
      console.log(`🔑 Código: ${code.substring(0, 2)}***`);
      console.log(`👤 Nombre: ${nombre || 'N/A'}`);
      
      const config = getSMTPConfig();
      console.log('📧 Configuración SMTP obtenida');
      
      // Crear transporter con manejo mejorado de errores DNS
      let transporter;
      try {
        transporter = await createTransporter();
        console.log('✅ Transporter creado exitosamente');
      } catch (transporterError) {
        console.error('❌ Error creando transporter:', transporterError);
        // Si el error es de DNS, intentar con IP directa
        if (transporterError.message && transporterError.message.includes('EBADNAME')) {
          console.warn('⚠️ Error DNS detectado, intentando con IP directa...');
          // Forzar uso de IP directa
          const gmailIP = '74.125.200.108';
          const directConfig = {
            host: gmailIP,
            port: config.port,
            secure: config.port === 465,
            auth: config.auth,
            tls: {
              rejectUnauthorized: false,
              servername: 'smtp.gmail.com'
            }
          };
          transporter = nodemailer.createTransport(directConfig);
          console.log('✅ Transporter creado con IP directa');
        } else {
          throw transporterError;
        }
      }
      
      // Asegurar que el nombre tenga un valor por defecto
      const nombreUsuario = nombre && nombre.trim() ? nombre.trim() : 'Usuario';
      
      const html = loadTemplate('password-reset-code', {
        code: code,
        nombre: nombreUsuario,
        year: new Date().getFullYear().toString(),
      });
      
      // Verificar conexión SMTP primero
      console.log('🔍 Verificando conexión SMTP con', config.host, '...');
      try {
        await transporter.verify();
        console.log('✅ Conexión SMTP verificada correctamente');
      } catch (verifyError) {
        console.warn('⚠️ Advertencia al verificar conexión SMTP:', verifyError.message);
        // Continuar de todos modos - a veces la verificación falla pero el envío funciona
      }
      
      // Guardar código en Firestore antes de enviar correo
      try {
        const db = admin.firestore();
        const codeHash = crypto.createHash('sha256').update(code.toString()).digest('hex');
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 15); // Expira en 15 minutos
        
        await db.collection('password_reset_codes').doc(codeHash).set({
          email: email.toLowerCase(),
          code_hash: codeHash,
          expires_at: admin.firestore.Timestamp.fromDate(expiresAt),
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          used: false,
          verified: false
        });
        
        console.log('✅ Código guardado en Firestore');
      } catch (firestoreError) {
        console.warn('⚠️ Error guardando código en Firestore:', firestoreError.message);
        // Continuar con el envío aunque falle guardar en Firestore
      }
      
      const mailOptions = {
        from: config.from,
        to: email,
        subject: '🔐 Código de Recuperación de Contraseña - AgroMarket',
        html: html,
        text: `Hola${nombre ? ' ' + nombre : ''},\n\nHemos recibido una solicitud para restablecer la contraseña de tu cuenta en AgroMarket.\n\nTu código de verificación es: ${code}\n\nEste código expirará en 15 minutos. Si no solicitaste este código, ignora este correo.\n\nIngresa este código en la página de recuperación de contraseña para continuar.`,
      };
      
      console.log('📤 Enviando correo con Nodemailer...');
      console.log('   From:', mailOptions.from);
      console.log('   To:', mailOptions.to);
      console.log('   Subject:', mailOptions.subject);
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log('='.repeat(80));
      console.log('✅ CÓDIGO DE RECUPERACIÓN ENVIADO EXITOSAMENTE');
      console.log('='.repeat(80));
      console.log('📧 Email destinatario:', email);
      console.log('🔑 Código:', code.substring(0, 2) + '***');
      console.log('📨 Message ID:', info.messageId);
      console.log('📧 Response:', info.response);
      console.log('⏰ Timestamp:', new Date().toISOString());
      console.log('='.repeat(80));
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.error('='.repeat(80));
      console.error('❌ ERROR ENVIANDO CÓDIGO DE RECUPERACIÓN');
      console.error('='.repeat(80));
      console.error('📧 Email:', request.data?.email);
      console.error('❌ Tipo de error:', error.constructor.name);
      console.error('❌ Mensaje:', error.message);
      console.error('❌ Stack:', error.stack);
      
      // Si es un error de DNS, proporcionar mensaje más específico
      if (error.message && (error.message.includes('EBADNAME') || error.message.includes('queryA'))) {
        console.error('⚠️ Error de DNS detectado, esto puede indicar un problema de red en Firebase Functions');
        throw new HttpsError(
          'internal',
          'Error de conexión DNS al servidor de correo. Por favor, intenta nuevamente más tarde.'
        );
      }
      
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

/**
 * Verificar código de recuperación de contraseña
 * Esta función solo verifica el código, no envía correos
 */
exports.verifyPasswordResetCode = onCall(
  {
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
  },
  async (request) => {
  try {
    const { email, code } = request.data;
    
    if (!email || !code) {
      throw new HttpsError(
        'invalid-argument',
        'Email y código son requeridos'
      );
    }
    
    // Buscar el código en Firestore
    const db = admin.firestore();
    const codeHash = crypto.createHash('sha256').update(code.toString()).digest('hex');
    
    // Buscar en la colección de códigos de reset
    const codesRef = db.collection('password_reset_codes');
    const snapshot = await codesRef
      .where('email', '==', email.toLowerCase())
      .where('code_hash', '==', codeHash)
      .where('used', '==', false)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return {
        valid: false,
        message: 'Código inválido o expirado',
      };
    }
    
    const codeDoc = snapshot.docs[0];
    const codeData = codeDoc.data();
    
    // Verificar que el código coincida (comparar hash)
    if (codeData.code_hash !== codeHash) {
      return {
        valid: false,
        message: 'Código inválido',
      };
    }
    
    // Verificar expiración
    const expiresAt = codeData.expires_at.toDate();
    if (expiresAt < new Date()) {
      return {
        valid: false,
        message: 'Código expirado',
      };
    }
    
    return {
      valid: true,
      codeHash: codeData.code_hash,
      expiresAt: expiresAt,
    };
  } catch (error) {
    console.error('Error verificando código de recuperación:', error);
    throw new HttpsError(
      'internal',
      'Error al verificar código: ' + error.message
    );
  }
});

/**
 * Enviar comprobante de compra por correo
 */
exports.sendReceiptEmail = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
    timeoutSeconds: 60, // Timeout de 60 segundos para permitir resolución DNS y conexión SMTP
    maxInstances: 10, // Máximo de instancias concurrentes
  },
  async (request) => {
    console.log('='.repeat(80));
    console.log('📧 FIREBASE FUNCTION: sendReceiptEmail - INICIANDO');
    console.log('='.repeat(80));
    console.log('📥 Datos recibidos:', JSON.stringify({
      email: request.data?.email,
      compraId: request.data?.compraId,
      nombre: request.data?.nombre,
      productosCount: request.data?.productos?.length || 0,
      total: request.data?.total,
      metodoPago: request.data?.metodoPago
    }, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    try {
      const {
        email,
        nombre,
        compraId,
        fechaCompra,
        productos,
        subtotal,
        envio,
        impuestos,
        total,
        metodoPago,
        direccionEntrega
      } = request.data;
      
      if (!email || !compraId || !productos || !Array.isArray(productos)) {
        console.error('❌ Validación falló: Email, compraId y productos son requeridos');
        throw new HttpsError(
          'invalid-argument',
          'Email, compraId y productos son requeridos'
        );
      }
      
      console.log('✅ Validación exitosa');
      console.log(`📧 Email: ${email}`);
      console.log(`📦 Compra ID: ${compraId}`);
      console.log(`👤 Nombre: ${nombre || 'N/A'}`);
      console.log(`📊 Productos: ${productos.length}`);
      console.log(`💰 Total: $${total}`);
      
      const config = getSMTPConfig();
      console.log('📧 Configuración SMTP obtenida');
      
      // Crear transporter con manejo mejorado de errores DNS
      let transporter;
      try {
        transporter = await createTransporter();
      } catch (transporterError) {
        console.error('❌ Error creando transporter:', transporterError);
        // Si el error es de DNS, intentar con IP directa
        if (transporterError.message && transporterError.message.includes('EBADNAME')) {
          console.warn('⚠️ Error DNS detectado, intentando con IP directa...');
          // Forzar uso de IP directa
          const gmailIP = '74.125.200.108';
          const directConfig = {
            host: gmailIP,
            port: config.port,
            secure: config.port === 465,
            auth: config.auth,
            tls: {
              rejectUnauthorized: false,
              servername: 'smtp.gmail.com'
            }
          };
          transporter = nodemailer.createTransport(directConfig);
          console.log('✅ Transporter creado con IP directa');
        } else {
          throw transporterError;
        }
      }
      
      // Construir HTML de productos
      let productosHtml = '';
      productos.forEach((producto, idx) => {
        productosHtml += `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align:center;">${idx + 1}</td>
            <td style="padding: 12px; border-bottom:1px solid #eee;">${producto.nombre || 'Producto'}</td>
            <td style="padding: 12px; border-bottom:1px solid #eee; text-align:center;">${producto.cantidad || 0} ${producto.unidad || 'kg'}</td>
            <td style="padding: 12px; border-bottom:1px solid #eee; text-align:right;">$${(parseFloat(producto.precio_unitario) || 0).toFixed(2)}</td>
            <td style="padding: 12px; border-bottom:1px solid #eee; text-align:right;">$${(parseFloat(producto.precio_total) || 0).toFixed(2)}</td>
          </tr>
        `;
      });
      
      // Configurar método de pago
      const metodoPagoLabels = {
        'tarjeta': 'Tarjeta de débito/crédito',
        'efectivo': 'Efectivo contra entrega',
        'transferencia': 'Transferencia bancaria'
      };
      const metodoPagoTexto = metodoPagoLabels[metodoPago] || metodoPago || 'N/A';
      
      // Obtener datos de dirección
      const ciudad = (direccionEntrega && direccionEntrega.ciudad) || 'No especificada';
      const telefono = (direccionEntrega && direccionEntrega.telefono) || 'No especificado';
      
      // Cargar template y reemplazar variables
      const html = loadTemplate('receipt-email', {
        compra_id: compraId,
        fecha_compra: fechaCompra || new Date().toLocaleString('es-MX'),
        metodo_pago: metodoPagoTexto,
        nombre_cliente: nombre || 'Cliente',
        email_cliente: email,
        productos_html: productosHtml,
        ciudad: ciudad,
        telefono: telefono,
        subtotal: (parseFloat(subtotal) || 0).toFixed(2),
        envio: (parseFloat(envio) || 0).toFixed(2),
        impuestos: (parseFloat(impuestos) || 0).toFixed(2),
        total: (parseFloat(total) || 0).toFixed(2),
        year: new Date().getFullYear().toString(),
      });
      
      // Crear texto plano
      const productosTexto = productos.map((p, idx) => 
        `${idx + 1}. ${p.nombre || 'Producto'} - ${p.cantidad || 0} ${p.unidad || 'kg'} - $${(parseFloat(p.precio_total) || 0).toFixed(2)}`
      ).join('\n');
      
      const text = `Comprobante de Compra - AgroMarket

Número de pedido: ${compraId}
Fecha: ${fechaCompra || new Date().toLocaleString('es-MX')}
Método de pago: ${metodoPagoTexto}

Cliente: ${nombre || 'Cliente'}
Email: ${email}

Productos:
${productosTexto}

Subtotal: $${(parseFloat(subtotal) || 0).toFixed(2)}
Envío: $${(parseFloat(envio) || 0).toFixed(2)}
Impuestos: $${(parseFloat(impuestos) || 0).toFixed(2)}
TOTAL: $${(parseFloat(total) || 0).toFixed(2)}

Ciudad de entrega: ${ciudad}
Teléfono: ${telefono}

Gracias por tu compra en AgroMarket 🍃`;
      
      const mailOptions = {
        from: config.from,
        to: email,
        subject: `🎉 Confirmación de Compra - Pedido #${compraId.substring(0, 9).toUpperCase()}`,
        html: html,
        text: text,
      };
      
      console.log('📤 Enviando correo con Nodemailer...');
      console.log('   From:', mailOptions.from);
      console.log('   To:', mailOptions.to);
      console.log('   Subject:', mailOptions.subject);
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log('='.repeat(80));
      console.log('✅ COMPROBANTE ENVIADO EXITOSAMENTE');
      console.log('='.repeat(80));
      console.log('📧 Email destinatario:', email);
      console.log('📦 Compra ID:', compraId);
      console.log('📨 Message ID:', info.messageId);
      console.log('📧 Response:', info.response);
      console.log('⏰ Timestamp:', new Date().toISOString());
      console.log('='.repeat(80));
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      console.error('❌ Error enviando comprobante de compra:', error);
      console.error('   Tipo de error:', error.constructor.name);
      console.error('   Mensaje:', error.message);
      console.error('   Stack:', error.stack);
      
      // Si es un error de DNS, proporcionar mensaje más específico
      if (error.message && (error.message.includes('EBADNAME') || error.message.includes('queryA'))) {
        console.error('⚠️ Error de DNS detectado, esto puede indicar un problema de red en Firebase Functions');
        throw new HttpsError(
          'internal',
          'Error de conexión DNS al servidor de correo. Por favor, intenta nuevamente más tarde.'
        );
      }
      
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

/**
 * Enviar notificación de cambio de estado de pedido
 */
exports.sendOrderStatusChangeEmail = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
  },
  async (request) => {
    try {
      const {
        email,
        nombre,
        compraId,
        nuevoEstado,
        estadoAnterior,
        productos,
        vendedorNombre,
        fechaActualizacion
      } = request.data;
      
      if (!email || !compraId || !nuevoEstado) {
        throw new HttpsError(
          'invalid-argument',
          'Email, compraId y nuevoEstado son requeridos'
        );
      }
      
      const config = getSMTPConfig();
      const transporter = await createTransporter();
      
      // Mapeo de estados a etiquetas en español
      const estadoLabels = {
        'preparando': 'Preparando',
        'enviado': 'Enviado',
        'recibido': 'Recibido',
        'cancelado': 'Cancelado'
      };
      
      const estadoLabel = estadoLabels[nuevoEstado] || nuevoEstado;
      const estadoAnteriorLabel = estadoAnterior ? (estadoLabels[estadoAnterior] || estadoAnterior) : null;
      
      // Construir lista de productos
      let productosLista = '';
      if (productos && Array.isArray(productos) && productos.length > 0) {
        productosLista = productos.map((p, idx) => 
          `<li>${p.nombre || 'Producto'} - ${p.cantidad || 0} ${p.unidad || 'kg'}</li>`
        ).join('');
      }
      
      // Cargar template y reemplazar variables
      const html = loadTemplate('order-status-change', {
        nombre_cliente: nombre || 'Cliente',
        compra_id: compraId,
        nuevo_estado: estadoLabel,
        estado_anterior: estadoAnteriorLabel || 'N/A',
        vendedor_nombre: vendedorNombre || 'Vendedor',
        productos_lista: productosLista || '<li>No hay productos especificados</li>',
        fecha_actualizacion: fechaActualizacion || new Date().toLocaleString('es-MX'),
        year: new Date().getFullYear().toString(),
      });
      
      // Crear texto plano
      const productosTexto = productos && Array.isArray(productos) 
        ? productos.map((p, idx) => 
            `${idx + 1}. ${p.nombre || 'Producto'} - ${p.cantidad || 0} ${p.unidad || 'kg'}`
          ).join('\n')
        : 'No hay productos especificados';
      
      const text = `Actualización de Estado de Pedido - AgroMarket

Hola${nombre ? ' ' + nombre : ''},

El estado de tu pedido #${compraId} ha cambiado.

Estado anterior: ${estadoAnteriorLabel || 'N/A'}
Nuevo estado: ${estadoLabel}

Productos:
${productosTexto}

Vendedor: ${vendedorNombre || 'Vendedor'}
Fecha de actualización: ${fechaActualizacion || new Date().toLocaleString('es-MX')}

Puedes ver el estado de tu pedido en cualquier momento desde tu cuenta.

Gracias por tu compra en AgroMarket 🍃`;
      
      const mailOptions = {
        from: config.from,
        to: email,
        subject: `📦 Actualización de Pedido #${compraId.substring(0, 9).toUpperCase()} - ${estadoLabel}`,
        html: html,
        text: text,
      };
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log('✅ Notificación de cambio de estado enviada a:', email);
      
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Error enviando notificación de cambio de estado:', error);
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

/**
 * Enviar notificación al administrador sobre nueva solicitud de vendedor
 */
exports.sendNewSellerApplicationNotification = onCall(
  {
    secrets: [smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, smtpFrom],
    cors: true, // Permitir CORS
    invoker: 'public', // Permitir llamadas públicas (sin autenticación)
  },
  async (request) => {
    try {
      const {
        solicitudId,
        nombre,
        email,
        nombreTienda,
        ubicacion,
        fechaSolicitud
      } = request.data;
      
      if (!solicitudId || !nombre || !email) {
        throw new HttpsError(
          'invalid-argument',
          'solicitudId, nombre y email son requeridos'
        );
      }
      
      // Obtener emails de todos los administradores
      const db = admin.firestore();
      
      // Buscar administradores de dos formas:
      // 1. Por array roles que contenga 'administrador'
      // 2. Por rol_activo que sea 'administrador' (fallback)
      const adminsByRoles = await db.collection('usuarios')
        .where('roles', 'array-contains', 'administrador')
        .get();
      
      const adminsByRolActivo = await db.collection('usuarios')
        .where('rol_activo', '==', 'administrador')
        .get();
      
      // Combinar resultados y eliminar duplicados
      const adminDocs = new Map();
      
      adminsByRoles.forEach(doc => {
        adminDocs.set(doc.id, doc);
      });
      
      adminsByRolActivo.forEach(doc => {
        if (!adminDocs.has(doc.id)) {
          adminDocs.set(doc.id, doc);
        }
      });
      
      console.log(`🔍 Administradores encontrados: ${adminDocs.size}`);
      adminDocs.forEach((doc, id) => {
        const data = doc.data();
        console.log(`  - ${id}: email=${data.email}, roles=${JSON.stringify(data.roles)}, rol_activo=${data.rol_activo}`);
      });
      
      if (adminDocs.size === 0) {
        console.warn('⚠️ No se encontraron administradores en el sistema');
        return {
          success: false,
          message: 'No se encontraron administradores para notificar'
        };
      }
      
      const adminEmails = [];
      adminDocs.forEach((doc) => {
        const adminData = doc.data();
        const adminEmail = adminData.email;
        if (adminEmail) {
          adminEmails.push(adminEmail);
        }
      });
      
      if (adminEmails.length === 0) {
        console.warn('⚠️ No se encontraron emails de administradores');
        return {
          success: false,
          message: 'No se encontraron emails de administradores'
        };
      }
      
      console.log(`📧 Enviando notificación a ${adminEmails.length} administrador(es):`, adminEmails);
      
      const config = getSMTPConfig();
      const transporter = await createTransporter();
      
      // Cargar template y reemplazar variables
      const html = loadTemplate('new-seller-application-admin', {
        nombre_solicitante: nombre,
        email_solicitante: email,
        nombre_tienda: nombreTienda || 'No especificado',
        ubicacion: ubicacion || 'No especificada',
        solicitud_id: solicitudId,
        fecha_solicitud: fechaSolicitud || new Date().toLocaleString('es-MX'),
        year: new Date().getFullYear().toString(),
      });
      
      // Crear texto plano
      const text = `Nueva Solicitud de Vendedor - AgroMarket

Se ha recibido una nueva solicitud para ser vendedor en AgroMarket.

Información del solicitante:
- Nombre: ${nombre}
- Email: ${email}
- Nombre de tienda: ${nombreTienda || 'No especificado'}
- Ubicación: ${ubicacion || 'No especificada'}
- Fecha de solicitud: ${fechaSolicitud || new Date().toLocaleString('es-MX')}
- ID de solicitud: ${solicitudId}

Por favor, revisa la solicitud en el panel de administración.

AgroMarket 🍃`;
      
      // Enviar correo a todos los administradores
      const mailOptions = {
        from: config.from,
        to: adminEmails.join(', '), // Enviar a todos los administradores
        subject: `🔔 Nueva Solicitud de Vendedor - ${nombre}`,
        html: html,
        text: text,
      };
      
      const info = await transporter.sendMail(mailOptions);
      
      console.log(`✅ Notificación de nueva solicitud enviada a ${adminEmails.length} administrador(es)`);
      
      return {
        success: true,
        messageId: info.messageId,
        adminsNotified: adminEmails.length,
        adminEmails: adminEmails
      };
    } catch (error) {
      console.error('Error enviando notificación de nueva solicitud:', error);
      throw new HttpsError(
        'internal',
        'Error al enviar correo: ' + error.message
      );
    }
  }
);

