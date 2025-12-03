/**
 * Script global para proteger páginas contra acceso después de logout
 * Verifica la autenticación cuando se carga la página y previene acceso con botón de retroceso
 */

(function() {
    'use strict';

    let verificando = false; // Flag para evitar múltiples verificaciones simultáneas

    // Verificar autenticación cuando se carga la página
    function verificarAutenticacion() {
        // Solo verificar si estamos en una página protegida (no en login/register)
        const path = window.location.pathname;
        const paginasPublicas = ['/auth/login', '/auth/register', '/auth/reset_password', '/', '/general/informacion', '/general/sobre_nosotros', '/descargar-apk'];
        
        if (paginasPublicas.some(p => path.startsWith(p))) {
            return; // No verificar en páginas públicas
        }
        
        // Evitar múltiples verificaciones simultáneas
        if (verificando) {
            return;
        }
        verificando = true;
        
        console.log('🔒 Verificando autenticación en:', path);

        // Función para verificar con Firebase
        function verificarConFirebase() {
            try {
                // Verificar si Firebase está disponible
                if (typeof firebase === 'undefined' || !window.firebaseConfig) {
                    // Si Firebase no está disponible después de 1 segundo, redirigir
                    setTimeout(() => {
                        if (typeof firebase === 'undefined') {
                            console.warn('⚠️ Firebase no disponible, redirigiendo por seguridad');
                            limpiarDatosResiduales();
                            window.location.replace('/auth/login');
                        }
                    }, 1000);
                    return;
                }

                // Inicializar Firebase si no está inicializado
                let auth;
                if (firebase.apps.length === 0) {
                    firebase.initializeApp(window.firebaseConfig);
                }
                auth = firebase.auth();
                
                // Verificar inmediatamente primero
                const currentUser = auth.currentUser;
                console.log('🔍 Usuario actual de Firebase:', currentUser ? currentUser.email : 'NINGUNO');
                
                // Verificar también con el servidor (Flask session) - esto es más confiable
                fetch('/auth/verificar-sesion', {
                    method: 'GET',
                    credentials: 'same-origin'
                }).then(response => {
                    if (!response.ok || response.status === 401) {
                        console.log('🔒 Sesión del servidor inválida, redirigiendo...');
                        limpiarDatosResiduales();
                        verificando = false;
                        window.location.replace('/auth/login');
                        return null;
                    }
                    return response.json();
                }).then(data => {
                    if (data && !data.authenticated) {
                        console.log('🔒 Servidor indica que no hay sesión, redirigiendo...');
                        limpiarDatosResiduales();
                        verificando = false;
                        window.location.replace('/auth/login');
                        return;
                    }
                    
                    // Si la sesión del servidor es válida, verificar también Firebase
                    if (!currentUser) {
                        console.log('⚠️ Sesión del servidor válida pero no hay usuario en Firebase');
                        // No redirigir si la sesión del servidor es válida (puede ser que Firebase aún se esté inicializando)
                        verificando = false;
                        return;
                    }
                    
                    console.log('✅ Autenticación verificada correctamente (servidor y Firebase)');
                    verificando = false;
                }).catch(error => {
                    console.error('Error verificando sesión:', error);
                    // Si falla la verificación del servidor, verificar solo con Firebase
                    if (!currentUser) {
                        console.log('🔒 No hay usuario en Firebase y falló verificación del servidor, redirigiendo...');
                        limpiarDatosResiduales();
                        verificando = false;
                        window.location.replace('/auth/login');
                        return;
                    }
                    verificando = false;
                });
                
                // También escuchar cambios en el estado de autenticación de Firebase
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (!user) {
                        console.log('🔒 Firebase detectó que el usuario se desautenticó, verificando servidor...');
                        // Verificar servidor antes de redirigir
                        fetch('/auth/verificar-sesion', {
                            method: 'GET',
                            credentials: 'same-origin'
                        }).then(response => {
                            if (!response.ok || response.status === 401) {
                                console.log('🔒 Servidor también confirma que no hay sesión, redirigiendo...');
                                limpiarDatosResiduales();
                                window.location.replace('/auth/login');
                            }
                        }).catch(() => {
                            // Si falla, redirigir por seguridad
                            limpiarDatosResiduales();
                            window.location.replace('/auth/login');
                        });
                    }
                });
                
            } catch (error) {
                console.error('Error verificando autenticación:', error);
                // En caso de error, redirigir por seguridad
                limpiarDatosResiduales();
                window.location.replace('/auth/login');
            }
        }

        // Intentar verificar inmediatamente
        if (typeof firebase !== 'undefined' && window.firebaseConfig) {
            verificarConFirebase();
        } else {
            // Esperar máximo 500ms a que Firebase se cargue
            let intentos = 0;
            const maxIntentos = 5; // 5 intentos = 500ms máximo
            const intervalo = setInterval(() => {
                if (typeof firebase !== 'undefined' && window.firebaseConfig) {
                    clearInterval(intervalo);
                    verificarConFirebase();
                } else if (intentos >= maxIntentos) {
                    clearInterval(intervalo);
                    // Si Firebase no está disponible, redirigir por seguridad
                    console.warn('⚠️ Firebase no disponible después de esperar');
                    limpiarDatosResiduales();
                    window.location.replace('/auth/login');
                }
                intentos++;
            }, 100);
        }
    }

    // Limpiar datos residuales
    function limpiarDatosResiduales() {
        const keysToRemove = [
            'firebase_uid', 'firebase_email', 'user_roles', 
            'user_rol_activo', 'user_nombre', 'carrito',
            'totalAmount', 'paymentIntentId', 'paymentDate', 'paymentMethod'
        ];
        
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
        
        // Limpiar claves de Stripe
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('stripe_') || key.startsWith('STRIPE_')) {
                localStorage.removeItem(key);
            }
        });
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith('stripe_') || key.startsWith('STRIPE_')) {
                sessionStorage.removeItem(key);
            }
        });
    }

    // Prevenir que el botón de retroceso muestre páginas en caché
    window.addEventListener('pageshow', function(event) {
        // Si la página se carga desde el cache del navegador (back/forward)
        if (event.persisted) {
            console.log('⚠️ Página cargada desde caché, verificando autenticación...');
            // Verificar autenticación inmediatamente
            verificarAutenticacion();
        }
    });
    
    // También verificar cuando se navega hacia atrás (popstate)
    window.addEventListener('popstate', function(event) {
        console.log('⚠️ Navegación hacia atrás detectada, verificando autenticación...');
        setTimeout(verificarAutenticacion, 100);
    });

    // Verificar cuando se carga la página
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(verificarAutenticacion, 100);
        });
    } else {
        // Si ya está cargado, verificar inmediatamente (con pequeño delay para que scripts se carguen)
        setTimeout(verificarAutenticacion, 100);
    }

    // También verificar cuando la página se vuelve visible (por si el usuario cambió de pestaña)
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            setTimeout(verificarAutenticacion, 100);
        }
    });
    
    // Verificar periódicamente (cada 2 segundos) por si el usuario fue deslogueado en otra pestaña
    setInterval(function() {
        const path = window.location.pathname;
        const paginasPublicas = ['/auth/login', '/auth/register', '/auth/reset_password', '/', '/general/informacion', '/general/sobre_nosotros', '/descargar-apk'];
        if (!paginasPublicas.some(p => path.startsWith(p))) {
            verificarAutenticacion();
        }
    }, 2000);

})();

