// Firebase Ultra-Fast - Máxima velocidad sin consultas
// static/js/firebase-ultra-fast.js

// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDZWmY0ggZthOKv17yHH57pkXsie_U2YnI",
    authDomain: "agromarket-625b2.firebaseapp.com",
    projectId: "agromarket-625b2",
    storageBucket: "agromarket-625b2.firebasestorage.app",
    messagingSenderId: "18163605615",
    appId: "1:18163605615:web:6910d608e280b028d6ad9a",
    measurementId: "G-CVL9DRNMG1"
};

window.firebaseConfig = firebaseConfig;

let authUltra = null;
let dbUltra = null;
let isFirebaseUltraInitialized = false;

// 2. Ultra-Fast Firebase Initialization
async function initializeFirebaseUltra() {
    if (isFirebaseUltraInitialized) {
        console.log('✅ Firebase Ultra ya está inicializado');
        return { auth: authUltra, db: dbUltra };
    }

    console.log('⚡ Inicializando Firebase Ultra...');
    const startTime = performance.now();

    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK no está cargado');
        }

        if (firebase.apps.length > 0) {
            const app = firebase.app();
            authUltra = firebase.auth(app);
            dbUltra = firebase.firestore(app);
        } else {
            const app = firebase.initializeApp(firebaseConfig);
            authUltra = firebase.auth(app);
            dbUltra = firebase.firestore(app);
        }

        isFirebaseUltraInitialized = true;
        const endTime = performance.now();
        console.log(`⚡ Firebase Ultra inicializado en ${(endTime - startTime).toFixed(2)}ms`);
        return { auth: authUltra, db: dbUltra };

    } catch (error) {
        console.error('❌ Error inicializando Firebase Ultra:', error);
        throw error;
    }
}

// 3. Ultra-Fast Login con validación de rol
async function loginUltraFast(email, password) {
    const startTime = performance.now();
    console.log('⚡ INICIO LOGIN ULTRA-RÁPIDO...');

    try {
        // Inicializar Firebase
        const { auth, db } = await initializeFirebaseUltra();
        
        // Login con Firebase Auth
        const result = await auth.signInWithEmailAndPassword(email, password);
        
        // Cachear UID inmediatamente para uso posterior
        localStorage.setItem('firebase_uid', result.user.uid);
        localStorage.setItem('firebase_email', result.user.email);
        
        // Obtener datos del usuario con Promise.race para timeout
        let userData = null;
        try {
            // Timeout de 3 segundos máximo para la consulta
            const queryPromise = db.collection('usuarios').doc(result.user.uid).get();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            
            const userDoc = await Promise.race([queryPromise, timeoutPromise]);
            
            if (userDoc.exists) {
                const firestoreData = userDoc.data();
                userData = {
                    uid: result.user.uid,
                    email: result.user.email,
                    nombre: result.user.displayName || firestoreData.nombre || result.user.email.split('@')[0],
                    roles: firestoreData.roles || [firestoreData.rol] || ['comprador'],
                    rol_activo: firestoreData.rol_activo || firestoreData.rol || 'comprador',
                    fecha_registro: firestoreData.fecha_registro || new Date().toISOString(),
                    activo: true
                };
                
                // Cachear datos en localStorage para acceso rápido
                localStorage.setItem('user_roles', JSON.stringify(userData.roles));
                localStorage.setItem('user_rol_activo', userData.rol_activo);
                localStorage.setItem('user_nombre', userData.nombre);
                
                console.log('✅ Datos del usuario obtenidos:', userData);
            } else {
                throw new Error('Usuario no encontrado');
            }
        } catch (error) {
            console.log('⚠️ Error obteniendo datos, usando cache o datos por defecto:', error.message);
            
            // Intentar recuperar del cache
            const cachedRoles = localStorage.getItem('user_roles');
            if (cachedRoles) {
                userData = {
                    uid: result.user.uid,
                    email: result.user.email,
                    nombre: localStorage.getItem('user_nombre') || result.user.displayName || result.user.email.split('@')[0],
                    roles: JSON.parse(cachedRoles),
                    rol_activo: localStorage.getItem('user_rol_activo') || 'comprador',
                    fecha_registro: new Date().toISOString(),
                    activo: true
                };
                console.log('✅ Usando datos del cache:', userData);
            } else {
                userData = {
                    uid: result.user.uid,
                    email: result.user.email,
                    nombre: result.user.displayName || result.user.email.split('@')[0],
                    roles: ['comprador'],
                    rol_activo: 'comprador',
                    fecha_registro: new Date().toISOString(),
                    activo: true
                };
            }
        }
        
        // Normalizar roles y rol_activo antes de redirigir
        try {
            let roles = userData?.roles || [];
            if (typeof roles === 'string') roles = [roles];
            roles = Array.isArray(roles) ? roles.map(r => String(r).toLowerCase().trim()).filter(Boolean) : [];
            if (roles.length === 1 && !userData.rol_activo) {
                userData.rol_activo = roles[0];
            }

            // Sincronizar sesión Flask (mejor experiencia en rutas protegidas)
            try {
                console.log('🔄 Sincronizando roles con Flask:', roles);
                const syncResponse = await fetch('/auth/sincronizar-rol', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        user_id: result.user.uid,
                        roles: roles,
                        rol_activo: userData.rol_activo || roles[0] || null,
                        nombre: userData.nombre,
                        email: result.user.email
                    })
                });
                const syncData = await syncResponse.json();
                console.log('✅ Roles sincronizados con Flask:', syncData);
            } catch(error) {
                console.warn('⚠️ Error sincronizando roles con Flask:', error);
            }
        } catch(e) { console.warn('⚠️ No se pudo normalizar/sincronizar roles:', e); }

        const endTime = performance.now();
        console.log(`⚡ LOGIN ULTRA-RÁPIDO completado en ${(endTime - startTime).toFixed(2)}ms`);
        
        // Bloqueo de acceso para vendedores NO aprobados
        try {
            const solicitudDoc = await db.collection('solicitudes_vendedores').doc(result.user.uid).get();
            if (solicitudDoc.exists) {
                const solicitud = solicitudDoc.data();
                const estado = (solicitud.estado || 'pendiente').toLowerCase();
                if (estado !== 'aprobada') {
                    // Mostrar mensaje y cerrar sesión, permanecer en login
                    showMessageUltraFast('Tu solicitud de vendedor está ' + estado + '. Un administrador debe aprobarla.', 'info');
                    await auth.signOut();
                    // Asegurar regresar al login
                    setTimeout(() => { window.location.replace('/auth/login'); }, 300);
                    return { user: null, userData: null };
                }
            }
        } catch (e) {
            console.warn('⚠️ No se pudo verificar solicitudes de vendedor:', e);
        }
        
        // Redirigir basado en el rol del usuario (con normalización aplicada)
        redirectUltraFast(userData);
        
        return { user: result.user, userData };

    } catch (error) {
        console.error('❌ Error en login ultra-rápido:', error);
        throw error;
    }
}

// 4. Redirección Ultra-Rápida con validación de rol
function redirectUltraFast(userData = null) {
    const startTime = performance.now();
    console.log('⚡ REDIRECCIÓN ULTRA-RÁPIDA...');
    
    // Obtener roles activos del usuario
    let roles = userData?.roles || [];
    if (typeof roles === 'string') roles = [roles];
    const rolesActivos = Array.isArray(roles) ? roles : [roles];
    const rolesFiltrados = rolesActivos
        .map(r => String(r).toLowerCase().trim())
        .filter(r => r);
    
    console.log('🎭 Roles del usuario:', rolesFiltrados);
    
    // Si tiene más de un rol activo, mostrar selector de rol
    if (rolesFiltrados.length > 1) {
        console.log('🔄 Usuario con múltiples roles, mostrando selector de rol');
        return showRolePicker(userData);
    }
    
    // Si tiene 0 o 1 rol, redirigir directamente al panel correspondiente SIN asumir por defecto
    let redirectUrl = null;
    let rolActivo = null;
    
    // Prioridad: administrador tiene la máxima prioridad
    if (rolesFiltrados.includes('administrador')) {
        rolActivo = 'administrador';
        redirectUrl = '/admin/panel';
        console.log('🛡️ Usuario es administrador, redirigiendo a panel admin');
    } else if (rolesFiltrados.length === 1) {
        rolActivo = rolesFiltrados[0];
    } else if (rolesFiltrados.length === 0) {
        // Si no hay lista de roles, intenta usar rol_activo de Firestore o cache
        rolActivo = (userData && userData.rol_activo) ? String(userData.rol_activo).toLowerCase().trim() : null;
        if (!rolActivo) {
            const cachedRol = localStorage.getItem('user_rol_activo');
            rolActivo = cachedRol ? String(cachedRol).toLowerCase().trim() : null;
        }
    }
    
    // Si aún no hay redirectUrl, determinar según rolActivo
    if (!redirectUrl) {
        if (rolActivo === 'administrador') {
            redirectUrl = '/admin/panel';
        } else if (rolActivo === 'vendedor') {
            redirectUrl = '/vendedor/panel';
        } else if (rolActivo === 'comprador') {
            redirectUrl = '/comprador/panel';
        } else {
            // No hay rol determinado -> ir a perfil para que elija o configure
            redirectUrl = '/auth/perfil';
        }
    }
    
    console.log(`🎯 Redirigiendo directamente al panel: ${rolActivo || 'sin rol'}`);
    console.log(`📋 Roles disponibles: ${rolesFiltrados.join(', ') || 'ninguno'}`);
    
    const endTime = performance.now();
    console.log(`⚡ Redirigiendo a ${redirectUrl} en ${(endTime - startTime).toFixed(2)}ms`);
    
    // Redirección inmediata con fallback por si alguna extensión bloquea
    window.location.assign(redirectUrl);
    setTimeout(() => {
        if (location.pathname !== new URL(redirectUrl, location.origin).pathname) {
            console.warn('⚠️ Fallback de redirección aplicado');
            location.href = redirectUrl;
        }
    }, 300);
}

// Modal de selección de rol tras login cuando hay múltiples roles
async function showRolePicker(userData) {
    const overlay = document.createElement('div');
    overlay.id = 'role-picker-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:2000;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:90%;max-width:420px;box-shadow:0 10px 30px rgba(0,0,0,.15);display:flex;flex-direction:column;gap:16px;text-align:center;';
    modal.innerHTML = `
        <h3 style="margin:0;color:#2c3e50;">¿Con qué rol deseas entrar?</h3>
        <p style="margin:0;color:#6c757d;">Puedes cambiarlo desde tu perfil cuando quieras.</p>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
            <button id="btn-rol-vendedor" style="padding:12px;border-radius:10px;border:none;background:#2ba656;color:#fff;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;">
                <i class="fas fa-store"></i> Entrar como Vendedor
            </button>
            <button id="btn-rol-comprador" style="padding:12px;border-radius:10px;border:2px solid #2ba656;background:#fff;color:#2ba656;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">
                <i class="fas fa-shopping-cart"></i> Entrar como Comprador
            </button>
        </div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const choose = async (rol) => {
        try {
            const { auth, db } = await initializeFirebaseUltra();
            const user = auth.currentUser;
            if (db && user) {
                await db.collection('usuarios').doc(user.uid).update({ rol_activo: rol, fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp?.() });
                // sincronizar sesión Flask (best-effort)
                try {
                    await fetch('/auth/sincronizar-rol', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                        body: JSON.stringify({
                            user_id: user.uid,
                            roles: userData.roles || [],
                            rol_activo: rol,
                            nombre: userData.nombre || user.displayName || (user.email||'').split('@')[0],
                            email: user.email
                        })
                    });
                } catch(_) {}
            }
        } catch(e) { console.warn('No se pudo persistir rol activo:', e); }
        window.location.href = rol === 'vendedor' ? '/vendedor/panel' : '/comprador/panel';
    };

    document.getElementById('btn-rol-vendedor').onclick = () => choose('vendedor');
    document.getElementById('btn-rol-comprador').onclick = () => choose('comprador');
}

// 5. Función de mensaje ultra-rápida
function showMessageUltraFast(message, type = 'info') {
    const existingMessage = document.getElementById('message-ultra');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.id = 'message-ultra';
    
    const bgColor = type === 'success' ? '#d4edda' : (type === 'error' ? '#f8d7da' : '#cfe2ff');
    const textColor = type === 'success' ? '#155724' : (type === 'error' ? '#721c24' : '#055160');
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    
    messageDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: -400px;
            background: ${bgColor};
            color: ${textColor};
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 500;
            max-width: 400px;
            transition: right 0.3s ease-in-out;
        ">
            <i class="fas ${icon}" style="font-size: 18px;"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        const notification = messageDiv.querySelector('div');
        notification.style.right = '20px';
    }, 100);
    
    setTimeout(() => {
        const notification = messageDiv.querySelector('div');
        notification.style.right = '-400px';
        setTimeout(() => {
            messageDiv.remove();
        }, 300);
    }, 3000);
}

// 6. Ultra-Fast Register
async function registerUltraFast(nombre, email, password, rol = 'comprador') {
    const startTime = performance.now();
    console.log('⚡ INICIO REGISTRO ULTRA-RÁPIDO...');
    console.log('📝 Datos del registro:', { nombre, email, rol });

    try {
        // Validar datos de entrada
        if (!nombre || !email || !password) {
            throw new Error('Todos los campos son obligatorios');
        }
        
        if (password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
        }
        
        if (!email.includes('@')) {
            throw new Error('El correo electrónico no es válido');
        }

        // Inicializar Firebase
        console.log('🔄 Inicializando Firebase...');
        const { auth, db } = await initializeFirebaseUltra();
        console.log('✅ Firebase inicializado');
        
        // Registrar con Firebase Auth
        console.log('🔄 Creando usuario en Firebase Auth...');
        const result = await auth.createUserWithEmailAndPassword(email, password);
        console.log('✅ Usuario creado en Firebase Auth:', result.user.uid);
        
        // Actualizar perfil del usuario
        console.log('🔄 Actualizando perfil del usuario...');
        try {
            await result.user.updateProfile({
                displayName: nombre
            });
            console.log('✅ Perfil actualizado');
        } catch (profileError) {
            console.warn('⚠️ Error actualizando perfil:', profileError.message);
            // Continuar aunque falle la actualización del perfil
        }
        
        // Crear documento del usuario en Firestore - ajustado para vendedores
        console.log('🔄 Creando documento en Firestore (flujo ajustado)...');
        if (String(rol).toLowerCase().trim() === 'vendedor') {
            // Para vendedores: NO crear aún documento completo de usuario con rol de vendedor.
            // Solo marcar en una colección de solicitudes. El formulario completo y el documento
            // se gestionan en templates/auth/register.html. Aquí solo dejamos al usuario en login.
            showMessageUltraFast('Tu solicitud de vendedor ha sido enviada. Un administrador la revisará.', 'info');
            try { await auth.signOut(); } catch(_) {}
            setTimeout(() => { window.location.replace('/auth/login'); }, 300);
            return { user: null, userData: null };
        } else {
            const userData = {
                nombre: nombre,
                email: email,
                roles: [rol],
                rol_activo: rol,
                fecha_registro: new Date().toISOString(),
                activo: true
            };
            try {
                await db.collection('usuarios').doc(result.user.uid).set(userData);
                console.log('✅ Documento creado en Firestore');
            } catch (firestoreError) {
                console.warn('⚠️ Error creando documento en Firestore:', firestoreError.message);
            }
            // Redirigir basado en el rol del usuario
            console.log('🔄 Redirigiendo...');
            redirectUltraFast(userData);
            return { user: result.user, userData };
        }
        const endTime = performance.now();
        console.log(`⚡ REGISTRO ULTRA-RÁPIDO completado en ${(endTime - startTime).toFixed(2)}ms`);
        return { user: result.user, userData: null };

    } catch (error) {
        console.error('❌ Error en registro ultra-rápido:', error);
        console.error('❌ Código de error:', error.code);
        console.error('❌ Mensaje de error:', error.message);
        
        // Limpiar usuario si se creó pero falló el proceso
        if (auth && auth.currentUser) {
            try {
                await auth.currentUser.delete();
                console.log('🧹 Usuario eliminado debido a error');
            } catch (deleteError) {
                console.warn('⚠️ No se pudo eliminar usuario:', deleteError.message);
            }
        }
        
        throw error;
    }
}

// Export functions globally
window.initializeFirebaseUltra = initializeFirebaseUltra;
window.loginUltraFast = loginUltraFast;
window.registerUltraFast = registerUltraFast;
window.redirectUltraFast = redirectUltraFast;
window.showMessageUltraFast = showMessageUltraFast;

// Auto-initialize Firebase on load
document.addEventListener('DOMContentLoaded', () => {
    if (!window.isFirebaseUltraInitialized) {
        initializeFirebaseUltra().catch(e => console.error("Error during auto-initialization:", e));
    }
});
