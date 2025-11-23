/**
 * Script para manejar el menú hamburguesa en móviles
 */

document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (!menuToggle || !sidebar) {
        return;
    }
    
    function openMenu() {
        sidebar.classList.add('open');
        if (overlay) {
            overlay.classList.add('active');
        }
        menuToggle.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevenir scroll del body
    }
    
    function closeMenu() {
        sidebar.classList.remove('open');
        if (overlay) {
            overlay.classList.remove('active');
        }
        menuToggle.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll
    }
    
    function toggleMenu() {
        if (sidebar.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
    }
    
    // Click en botón hamburguesa
    menuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleMenu();
    });
    
    // Click en overlay para cerrar
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeMenu();
        });
    }
    
    // Cerrar al hacer click en un enlace (solo en móvil)
    const menuLinks = sidebar.querySelectorAll('.menu a');
    menuLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                setTimeout(closeMenu, 100);
            }
        });
    });
    
    // Cerrar al redimensionar a desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && sidebar.classList.contains('open')) {
            closeMenu();
        }
    });
    
    // Cargar foto de perfil del usuario
    loadSidebarProfile();
});

/**
 * Cargar foto de perfil y nombre del usuario en el sidebar
 */
function loadSidebarProfile() {
    // Intentar cargar perfil con retry si Firebase no está listo
    let attempts = 0;
    const maxAttempts = 10;
    
    function tryLoadProfile() {
        attempts++;
        
        // Verificar si Firebase está disponible
        if (typeof firebase === 'undefined' || !firebase.auth) {
            if (attempts < maxAttempts) {
                // Reintentar después de 500ms
                setTimeout(tryLoadProfile, 500);
            } else {
                console.log('Firebase no disponible después de varios intentos, usando datos del servidor');
            }
            return;
        }
        
        try {
            const auth = firebase.auth();
            const db = firebase.firestore();
            
            // Esperar a que Firebase esté listo
            auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    console.log('Usuario no autenticado');
                    return;
                }
                
                try {
                    // Obtener datos del usuario desde Firestore
                    const userDoc = await db.collection('usuarios').doc(user.uid).get();
                    const userData = userDoc.exists ? userDoc.data() : null;
                    
                    // Elementos del sidebar
                    const avatarImg = document.getElementById('sidebar-profile-avatar-img');
                    const avatarIcon = document.getElementById('sidebar-profile-avatar-icon');
                    const profileName = document.getElementById('sidebar-profile-name');
                    const profileEmail = document.getElementById('sidebar-profile-email');
                    
                    // Actualizar nombre
                    if (profileName) {
                        const displayName = userData?.nombre || userData?.displayName || user.displayName || user.email?.split('@')[0] || 'Usuario';
                        profileName.textContent = displayName;
                    }
                    
                    // Actualizar email
                    if (profileEmail && user.email) {
                        profileEmail.textContent = user.email;
                    }
                    
                    // Obtener foto de perfil
                    const fotoPerfil = userData?.foto_perfil || user.photoURL;
                    
                    if (fotoPerfil && avatarImg) {
                        // Mostrar imagen
                        avatarImg.src = fotoPerfil;
                        avatarImg.style.display = 'block';
                        avatarImg.onload = function() {
                            if (avatarIcon) {
                                avatarIcon.style.display = 'none';
                            }
                        };
                        avatarImg.onerror = function() {
                            // Si falla la carga, mostrar icono
                            avatarImg.style.display = 'none';
                            if (avatarIcon) {
                                avatarIcon.style.display = 'block';
                            }
                        };
                    } else {
                        // Mostrar icono por defecto
                        if (avatarImg) {
                            avatarImg.style.display = 'none';
                        }
                        if (avatarIcon) {
                            avatarIcon.style.display = 'block';
                        }
                    }
                } catch (error) {
                    console.error('Error cargando perfil del sidebar:', error);
                }
            });
        } catch (error) {
            console.error('Error inicializando Firebase en sidebar:', error);
        }
    }
    
    // Iniciar carga
    tryLoadProfile();
}

