// Firebase Auth Integration para AgroMarket
// Integración con los formularios existentes de login y register

// Variables globales
let auth = null;
let db = null;
let firebaseInitialized = false;

// Estado global
let currentUser = null;
let redirecting = false;
let authListenerInitialized = false;

// Función para inicializar Firebase de manera optimizada
function initializeFirebaseAuth() {
    if (firebaseInitialized) {
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        console.log('🔄 Inicializando Firebase Auth...');
        const startTime = performance.now();
        
        try {
            // Verificar si Firebase está disponible
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK no está cargado');
            }
            
            // Verificar si ya está inicializado
            if (firebase.apps.length > 0) {
                console.log('✅ Firebase ya está inicializado');
                auth = firebase.auth();
                db = firebase.firestore();
                firebaseInitialized = true;
                
                const endTime = performance.now();
                console.log(`✅ Firebase Auth inicializado en ${(endTime - startTime).toFixed(2)}ms`);
                resolve();
                return;
            }
            
            // Verificar que la configuración esté disponible
            if (!window.firebaseConfig) {
                throw new Error('Configuración de Firebase no disponible');
            }
            
            // Inicializar Firebase
            const app = firebase.initializeApp(window.firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
            
            // Configuraciones de rendimiento
            db.settings({
                cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
                ignoreUndefinedProperties: true
            });
            
            auth.useDeviceLanguage();
            
            firebaseInitialized = true;
            
            const endTime = performance.now();
            console.log(`✅ Firebase Auth inicializado en ${(endTime - startTime).toFixed(2)}ms`);
            resolve();
            
        } catch (error) {
            console.error('❌ Error inicializando Firebase Auth:', error);
            reject(error);
        }
    });
}

// Función para probar Firebase
async function testFirebase() {
    try {
        await initializeFirebaseAuth();
        console.log('✅ Firebase config:', window.firebaseConfig);
        console.log('✅ Firebase app:', firebase.app());
        console.log('✅ Auth:', auth);
        console.log('✅ Firestore:', db);
        return true;
    } catch (error) {
        console.error('❌ Error probando Firebase:', error);
        return false;
    }
}

// Función para probar redirección de roles
async function testRoleRedirect() {
    try {
        const user = auth.currentUser;
        if (user) {
            console.log('🧪 Probando redirección para usuario:', user.email);
            await redirectAfterLogin(user);
        } else {
            console.log('❌ No hay usuario autenticado');
        }
    } catch (error) {
        console.error('❌ Error en test:', error);
    }
}

// Escuchar cambios en el estado de autenticación (DESHABILITADO TEMPORALMENTE)
// DESHABILITADO para evitar bucles de redirección
console.log('⚠️ AuthStateChanged DESHABILITADO para diagnóstico');

// Función para redirigir después del login (OPTIMIZADA)
async function redirectAfterLogin(user) {
    const startTime = performance.now();
    console.log('🚀 REDIRECCIÓN para:', user.email);
    console.log('📍 URL actual:', window.location.href);
    
    try {
        // Redirección inmediata por defecto
        let redirectUrl = '/comprador/panel';
        
        // Intentar obtener datos del usuario con timeout
        console.log('🔍 Verificando rol del usuario...');
        const userDocPromise = db.collection('usuarios').doc(user.uid).get();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
        );
        
        try {
            const userDoc = await Promise.race([userDocPromise, timeoutPromise]);
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                console.log('📋 Datos del usuario:', userData);
                
                const roles = userData.roles || [userData.rol] || ['comprador'];
                console.log('👤 Roles encontrados:', roles);
                
                if (roles.length === 1) {
                    if (roles[0] === 'vendedor') {
                        redirectUrl = '/vendedor/panel';
                        console.log('🏪 Redirigiendo a VENDEDOR');
                    } else {
                        redirectUrl = '/comprador/panel';
                        console.log('🛒 Redirigiendo a COMPRADOR');
                    }
                } else if (roles.length > 1) {
                    redirectUrl = '/auth/seleccionar_rol';
                    console.log('🔄 Redirigiendo a SELECCIÓN DE ROL');
                }
            } else {
                console.log('⚠️ Usuario sin datos, redirigiendo por defecto');
                // Crear documento básico en background (no esperar)
                db.collection('usuarios').doc(user.uid).set({
                    nombre: user.displayName || '',
                    email: user.email,
                    roles: ['comprador'],
                    rol_activo: 'comprador',
                    fecha_registro: firebase.firestore.FieldValue.serverTimestamp(),
                    activo: true
                }).catch(err => console.log('⚠️ Error creando documento:', err));
            }
        } catch (timeoutError) {
            console.log('⏰ Timeout verificando rol, redirigiendo por defecto');
        }
        
        const endTime = performance.now();
        console.log(`🎯 Redirigiendo a ${redirectUrl} en ${(endTime - startTime).toFixed(2)}ms`);
        window.location.href = redirectUrl;
        
    } catch (error) {
        console.error('❌ Error al verificar rol:', error);
        console.log('🛒 Redirigiendo a COMPRADOR por defecto (error)');
        window.location.href = '/comprador/panel';
    }
}

// Función para mostrar mensajes
function showMessage(message, type = 'info') {
    // Crear elemento de mensaje
    const messageDiv = document.createElement('div');
    messageDiv.className = `flash ${type}`;
    messageDiv.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        ${message}
    `;
    
    // Insertar al inicio del formulario
    const form = document.querySelector('.form-container');
    form.insertBefore(messageDiv, form.firstChild);
    
    // Remover después de 5 segundos
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Función para manejar el login (OPTIMIZADA)
async function handleLogin(email, password) {
    const startTime = performance.now();
    console.log('🚀 INICIO LOGIN:', new Date().toISOString());
    
    try {
        // Inicializar Firebase si no está listo
        console.log('🔄 Inicializando Firebase...');
        await initializeFirebaseAuth();
        console.log(`✅ Firebase inicializado en ${(performance.now() - startTime).toFixed(2)}ms`);
        
        showMessage('Iniciando sesión...', 'info');
        console.log('⏱️ Paso 1 - Mostrando mensaje:', (performance.now() - startTime).toFixed(2), 'ms');
        
        const authStart = performance.now();
        const result = await auth.signInWithEmailAndPassword(email, password);
        console.log(`⏱️ Paso 2 - Firebase Auth completado: ${(performance.now() - authStart).toFixed(2)}ms`);
        
        showMessage('¡Login exitoso! Redirigiendo...', 'success');
        console.log('⏱️ Paso 3 - Mostrando mensaje éxito:', (performance.now() - startTime).toFixed(2), 'ms');
        
        // Redirección con verificación de rol
        console.log('⏱️ Paso 4 - Iniciando redirección:', (performance.now() - startTime).toFixed(2), 'ms');
        console.log('Login exitoso, verificando rol...');
        
        // Redirección con verificación de rol
        await redirectAfterLogin(result.user);
        console.log('⏱️ Paso 5 - Redirección enviada:', Date.now() - startTime, 'ms');
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        console.log('⏱️ Error después de:', Date.now() - startTime, 'ms');
        
        let errorMessage = 'Error al iniciar sesión';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No existe una cuenta con este correo electrónico';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Contraseña incorrecta';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Correo electrónico inválido';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Demasiados intentos fallidos. Intenta más tarde';
                break;
            default:
                errorMessage = error.message;
        }
        
        showMessage(errorMessage, 'error');
    }
}

// Función para manejar el registro (OPTIMIZADA)
async function handleRegister(nombre, email, password, rol) {
    const startTime = Date.now();
    console.log('🚀 INICIO REGISTRO:', new Date().toISOString());
    
    try {
        showMessage('Creando cuenta...', 'info');
        console.log('⏱️ Paso 1 - Mostrando mensaje:', Date.now() - startTime, 'ms');
        
        // Crear usuario en Firebase Auth SIN timeout
        console.log('⏱️ Paso 2 - Iniciando Firebase Auth:', Date.now() - startTime, 'ms');
        const result = await auth.createUserWithEmailAndPassword(email, password);
        console.log('⏱️ Paso 3 - Firebase Auth completado:', Date.now() - startTime, 'ms');
        
        // Actualizar perfil
        console.log('⏱️ Paso 4 - Actualizando perfil:', Date.now() - startTime, 'ms');
        await result.user.updateProfile({ displayName: nombre });
        console.log('⏱️ Paso 5 - Perfil actualizado:', Date.now() - startTime, 'ms');
        
        // Crear documento en Firestore
        console.log('⏱️ Paso 6 - Creando documento Firestore:', Date.now() - startTime, 'ms');
        await db.collection('usuarios').doc(result.user.uid).set({
            nombre: nombre,
            email: email,
            roles: [rol],
            rol_activo: rol,
            fecha_registro: firebase.firestore.FieldValue.serverTimestamp(),
            activo: true
        });
        console.log('⏱️ Paso 7 - Documento Firestore creado:', Date.now() - startTime, 'ms');
        
        showMessage('¡Cuenta creada exitosamente! Redirigiendo al login...', 'success');
        console.log('⏱️ Paso 8 - Mostrando mensaje éxito:', Date.now() - startTime, 'ms');
        
        // Redirigir inmediatamente
        console.log('⏱️ Paso 9 - Redirigiendo:', Date.now() - startTime, 'ms');
        window.location.href = '/login';
        
    } catch (error) {
        console.error('❌ Error en registro:', error);
        console.log('⏱️ Error después de:', Date.now() - startTime, 'ms');
        
        let errorMessage = 'Error al crear la cuenta';
        
        if (error.message.includes('Timeout')) {
            errorMessage = 'El registro tardó demasiado. Intenta de nuevo.';
        } else {
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = 'Ya existe una cuenta con este correo electrónico';
                    break;
                case 'auth/invalid-email':
                    errorMessage = 'Correo electrónico inválido';
                    break;
                case 'auth/weak-password':
                    errorMessage = 'La contraseña es muy débil';
                    break;
                case 'auth/network-request-failed':
                    errorMessage = 'Error de conexión. Verifica tu internet';
                    break;
                case 'permission-denied':
                    errorMessage = 'Error de permisos en Firestore';
                    break;
                default:
                    errorMessage = `Error: ${error.message}`;
            }
        }
        
        showMessage(errorMessage, 'error');
        throw error; // Re-lanzar para que el template pueda manejarlo
    }
}

// Función para limpiar todo el almacenamiento local
function limpiarAlmacenamientoLocal() {
    try {
        // Limpiar datos de Firebase Auth
        const keysToRemove = [
            'firebase_uid',
            'firebase_email',
            'user_roles',
            'user_rol_activo',
            'user_nombre',
            'carrito',
            'totalAmount',
            'paymentIntentId',
            'paymentDate',
            'paymentMethod'
        ];
        
        // Limpiar localStorage
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });
        
        // Limpiar sessionStorage
        keysToRemove.forEach(key => {
            sessionStorage.removeItem(key);
        });
        
        // Limpiar todas las claves relacionadas con Stripe
        const allKeys = Object.keys(localStorage);
        allKeys.forEach(key => {
            if (key.startsWith('stripe_') || key.startsWith('STRIPE_')) {
                localStorage.removeItem(key);
            }
        });
        
        const allSessionKeys = Object.keys(sessionStorage);
        allSessionKeys.forEach(key => {
            if (key.startsWith('stripe_') || key.startsWith('STRIPE_')) {
                sessionStorage.removeItem(key);
            }
        });
        
        console.log('✅ Almacenamiento local limpiado');
    } catch (error) {
        console.error('⚠️ Error limpiando almacenamiento:', error);
    }
}

// Función para cerrar sesión
async function handleLogout() {
    try {
        // Limpiar almacenamiento primero
        limpiarAlmacenamientoLocal();
        
        // Cerrar sesión en Firebase si está disponible
        if (auth) {
            try {
                await auth.signOut();
                console.log('✅ Sesión de Firebase cerrada');
            } catch (firebaseError) {
                console.warn('⚠️ Error cerrando sesión en Firebase (puede que no esté autenticado):', firebaseError);
            }
        }
        
        // Redirigir al login
        window.location.href = '/auth/login';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        // Aún así limpiar y redirigir
        limpiarAlmacenamientoLocal();
        window.location.href = '/auth/login';
    }
}

// Función para recuperar contraseña
async function handleForgotPassword(email) {
    try {
        await auth.sendPasswordResetEmail(email);
        showMessage('Se ha enviado un correo para restablecer tu contraseña', 'success');
    } catch (error) {
        console.error('Error al enviar correo de recuperación:', error);
        
        let errorMessage = 'Error al enviar correo de recuperación';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No existe una cuenta con este correo electrónico';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Correo electrónico inválido';
                break;
            default:
                errorMessage = error.message;
        }
        
        showMessage(errorMessage, 'error');
    }
}

// Exportar funciones para uso global
// Exponer funciones globalmente para uso en otras páginas
window.limpiarAlmacenamientoLocal = limpiarAlmacenamientoLocal;
window.handleLogout = handleLogout;

// Función global de logout que puede ser llamada desde cualquier página
window.cerrarSesionCompleto = async function() {
    await handleLogout();
};

window.firebaseAuth = {
    handleLogin,
    handleRegister,
    handleLogout,
    handleForgotPassword,
    currentUser: () => currentUser,
    testFirebase,
    testRoleRedirect
};
