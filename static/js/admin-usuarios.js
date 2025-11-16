let auth = null;
let db = null;
let currentUser = null;
let usuariosData = [];
let usuariosFiltrados = [];

async function initializeFirebase() {
    try {
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK no está cargado');
        }

        if (firebase.apps.length > 0) {
            auth = firebase.auth();
            db = firebase.firestore();
        } else {
            const app = firebase.initializeApp(window.firebaseConfig);
            auth = firebase.auth();
            db = firebase.firestore();
        }

        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
            ignoreUndefinedProperties: true
        });

        // Esperar a que el usuario esté disponible
        currentUser = auth.currentUser;
        if (!currentUser) {
            console.log('⏳ Esperando autenticación...');
            // Esperar un momento a que Firebase Auth se inicialice
            let usuarioEncontrado = false;
            await new Promise((resolve) => {
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (user) {
                        currentUser = user;
                        usuarioEncontrado = true;
                        unsubscribe();
                        resolve();
                    }
                });
                // Timeout de seguridad - solo mostrar error si realmente no hay usuario
                setTimeout(() => {
                    if (!usuarioEncontrado && !currentUser) {
                        console.error('❌ Timeout esperando autenticación después de 5 segundos');
                        // No redirigir automáticamente
                    }
                    resolve();
                }, 5000);
            });
        }

        if (!currentUser) {
            console.error('❌ No hay usuario autenticado después de esperar');
            // No redirigir automáticamente, mostrar mensaje
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #f44336; color: white; padding: 1rem; border-radius: 8px; z-index: 10000;';
            errorDiv.innerHTML = '<strong>Error:</strong> No estás autenticado. <a href="/auth/login" style="color: white; text-decoration: underline;">Ir al login</a>';
            document.body.appendChild(errorDiv);
            return;
        }

        console.log('✅ Usuario autenticado:', currentUser.uid);

        // Verificar que el usuario sea administrador
        console.log('🔍 Buscando usuario en Firestore:', currentUser.uid);
        const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
        if (!userDoc.exists) {
            console.error('❌ Usuario no encontrado en Firestore');
            // No redirigir automáticamente, mostrar mensaje
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ff9800; color: white; padding: 1rem; border-radius: 8px; z-index: 10000;';
            errorDiv.innerHTML = '<strong>Advertencia:</strong> Usuario no encontrado en la base de datos. <a href="/auth/perfil" style="color: white; text-decoration: underline;">Ir al perfil</a>';
            document.body.appendChild(errorDiv);
            return;
        }

        const userData = userDoc.data();
        console.log('📋 Datos del usuario (RAW):', userData);
        console.log('📋 Roles (RAW):', userData.roles);
        console.log('📋 Rol activo (RAW):', userData.rol_activo);
        
        const roles = userData.roles || [];
        console.log('🎭 Roles extraídos:', roles);
        console.log('🎭 Tipo de roles:', typeof roles);
        console.log('🎭 Es array?:', Array.isArray(roles));
        console.log('🎭 Longitud del array:', Array.isArray(roles) ? roles.length : 'N/A');
        
        // Normalizar roles para comparación
        let rolesNormalizados = [];
        if (Array.isArray(roles)) {
            rolesNormalizados = roles.map(r => {
                const normalized = String(r).toLowerCase().trim();
                console.log(`  - Rol original: "${r}" -> normalizado: "${normalized}"`);
                return normalized;
            });
        } else if (typeof roles === 'string') {
            rolesNormalizados = [roles.toLowerCase().trim()];
        } else if (roles) {
            // Si es un objeto u otro tipo, intentar convertirlo
            rolesNormalizados = [String(roles).toLowerCase().trim()];
        }
        
        console.log('🎭 Roles normalizados finales:', rolesNormalizados);
        console.log('🎭 Buscando "administrador" en:', rolesNormalizados);
        
        const tieneAdmin = rolesNormalizados.includes('administrador');
        console.log('🛡️ RESULTADO: Tiene rol de administrador?', tieneAdmin);
        
        // Verificación adicional: también verificar rol_activo
        const rolActivo = userData.rol_activo ? String(userData.rol_activo).toLowerCase().trim() : null;
        console.log('🛡️ Rol activo normalizado:', rolActivo);
        const tieneAdminPorRolActivo = rolActivo === 'administrador';
        console.log('🛡️ Tiene admin por rol_activo?', tieneAdminPorRolActivo);
        
        const tieneAdminFinal = tieneAdmin || tieneAdminPorRolActivo;
        console.log('🛡️ RESULTADO FINAL: Tiene admin (roles o rol_activo)?', tieneAdminFinal);
        
        if (!tieneAdminFinal) {
            console.error('❌ VALIDACIÓN FALLÓ');
            console.error('❌ Roles normalizados:', rolesNormalizados);
            console.error('❌ Rol activo:', rolActivo);
            console.error('❌ Datos completos del usuario:', JSON.stringify(userData, null, 2));
            
            // Mostrar error detallado en la página
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 20px; left: 20px; right: 20px; background: #ff9800; color: white; padding: 1.5rem; border-radius: 8px; z-index: 10000; max-width: 600px; margin: 0 auto;';
            errorDiv.innerHTML = `
                <strong>⚠️ Validación de rol falló</strong><br>
                <small>Roles encontrados: ${JSON.stringify(rolesNormalizados)}<br>
                Rol activo: ${rolActivo || 'N/A'}</small><br>
                <button onclick="window.location.href='/auth/perfil'" style="margin-top: 10px; padding: 8px 16px; background: white; color: #ff9800; border: none; border-radius: 4px; cursor: pointer;">
                    Ir al perfil
                </button>
            `;
            document.body.appendChild(errorDiv);
            return;
        } else {
            console.log('✅✅✅ Usuario administrador verificado correctamente ✅✅✅');
        }

        await cargarUsuarios();
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
        console.error('Stack:', error.stack);
        // No redirigir automáticamente en caso de error, solo mostrar en consola
    }
}

async function cargarUsuarios() {
    try {
        const loadingEl = document.getElementById('loadingUsuarios');
        const tableEl = document.getElementById('usuariosTable');
        
        loadingEl.style.display = 'block';
        tableEl.style.display = 'none';

        const usuariosSnapshot = await db.collection('usuarios').get();
        usuariosData = [];
        
        usuariosSnapshot.forEach(doc => {
            const data = doc.data();
            usuariosData.push({
                id: doc.id,
                nombre: data.nombre || 'Sin nombre',
                email: data.email || 'Sin email',
                roles: Array.isArray(data.roles) ? data.roles : (data.roles ? [data.roles] : []),
                activo: data.activo !== false,
                fecha_registro: data.fecha_registro || null,
                foto_perfil: data.foto_perfil || null
            });
        });

        usuariosFiltrados = [...usuariosData];
        renderizarUsuarios();
        
        loadingEl.style.display = 'none';
        tableEl.style.display = 'table';
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        document.getElementById('loadingUsuarios').innerHTML = '<p style="color: red;">Error al cargar usuarios</p>';
    }
}

function renderizarUsuarios() {
    const tbody = document.getElementById('usuariosTableBody');
    tbody.innerHTML = '';

    if (usuariosFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No se encontraron usuarios</td></tr>';
        return;
    }

    usuariosFiltrados.forEach(usuario => {
        const tr = document.createElement('tr');
        
        const fechaRegistro = usuario.fecha_registro 
            ? new Date(usuario.fecha_registro.toDate ? usuario.fecha_registro.toDate() : usuario.fecha_registro).toLocaleDateString('es-MX')
            : 'N/A';

        const rolesHTML = usuario.roles.map(rol => {
            const clase = `role-${rol}`;
            return `<span class="role-badge ${clase}">${rol}</span>`;
        }).join(' ');

        tr.innerHTML = `
            <td>
                <div class="user-info">
                    ${usuario.foto_perfil 
                        ? `<img src="${usuario.foto_perfil}" alt="${usuario.nombre}" class="user-avatar" onerror="this.style.display='none'">`
                        : `<i class="fas fa-user-circle" style="font-size: 2rem; color: #ddd; margin-right: 0.5rem;"></i>`
                    }
                    <div>
                        <div class="user-name">${usuario.nombre}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="user-email">${usuario.email}</div>
            </td>
            <td>${rolesHTML || '<span style="color: #999;">Sin roles</span>'}</td>
            <td>
                <span class="status-badge ${usuario.activo ? 'status-activo' : 'status-inactivo'}">
                    ${usuario.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>${fechaRegistro}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-edit" onclick="editarUsuario('${usuario.id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    ${usuario.id !== currentUser.uid 
                        ? `<button class="btn-action btn-delete" onclick="eliminarUsuario('${usuario.id}', '${usuario.nombre}')">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>`
                        : ''
                    }
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function filtrarUsuarios() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    usuariosFiltrados = usuariosData.filter(usuario => {
        return usuario.nombre.toLowerCase().includes(searchTerm) ||
               usuario.email.toLowerCase().includes(searchTerm);
    });
    renderizarUsuarios();
}

function filtrarPorRol(rol) {
    // Actualizar botones activos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    if (rol === 'todos') {
        usuariosFiltrados = [...usuariosData];
    } else {
        usuariosFiltrados = usuariosData.filter(usuario => {
            return usuario.roles.includes(rol);
        });
    }
    renderizarUsuarios();
}

function editarUsuario(userId) {
    const usuario = usuariosData.find(u => u.id === userId);
    if (!usuario) return;

    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserName').value = usuario.nombre;
    document.getElementById('editUserEmail').value = usuario.email;
    document.getElementById('editRoleComprador').checked = usuario.roles.includes('comprador');
    document.getElementById('editRoleVendedor').checked = usuario.roles.includes('vendedor');
    document.getElementById('editRoleAdministrador').checked = usuario.roles.includes('administrador');
    document.getElementById('editUserStatus').value = usuario.activo.toString();

    document.getElementById('editUserModal').classList.add('active');
}

function cerrarModal() {
    document.getElementById('editUserModal').classList.remove('active');
}

async function guardarUsuario(e) {
    e.preventDefault();
    
    const userId = document.getElementById('editUserId').value;
    const nombre = document.getElementById('editUserName').value;
    const email = document.getElementById('editUserEmail').value;
    const activo = document.getElementById('editUserStatus').value === 'true';
    
    const roles = [];
    if (document.getElementById('editRoleComprador').checked) roles.push('comprador');
    if (document.getElementById('editRoleVendedor').checked) roles.push('vendedor');
    if (document.getElementById('editRoleAdministrador').checked) roles.push('administrador');

    try {
        await db.collection('usuarios').doc(userId).update({
            nombre: nombre,
            email: email,
            roles: roles,
            activo: activo,
            fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Actualizar también en Firebase Auth si es el email
        try {
            const user = await auth.getUser(userId);
            if (user && email !== user.email) {
                // Nota: Cambiar email requiere reautenticación, así que solo actualizamos el nombre
                await auth.updateUser(userId, {
                    displayName: nombre
                });
            }
        } catch (authError) {
            console.warn('No se pudo actualizar en Auth:', authError);
        }

        alert('Usuario actualizado correctamente');
        cerrarModal();
        await cargarUsuarios();
    } catch (error) {
        console.error('Error actualizando usuario:', error);
        alert('Error al actualizar el usuario: ' + error.message);
    }
}

async function eliminarUsuario(userId, nombre) {
    if (!confirm(`¿Estás seguro de que quieres eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) {
        return;
    }

    try {
        // Marcar como inactivo en lugar de eliminar
        await db.collection('usuarios').doc(userId).update({
            activo: false,
            fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert('Usuario desactivado correctamente');
        await cargarUsuarios();
    } catch (error) {
        console.error('Error eliminando usuario:', error);
        alert('Error al eliminar el usuario: ' + error.message);
    }
}

function cerrarSesion() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        auth.signOut().then(() => {
            window.location.href = '/auth/login';
        }).catch(error => {
            console.error('Error al cerrar sesión:', error);
        });
    }
}

// Event listeners
document.getElementById('editUserForm').addEventListener('submit', guardarUsuario);

// Cerrar modal al hacer clic fuera
document.getElementById('editUserModal').addEventListener('click', (e) => {
    if (e.target.id === 'editUserModal') {
        cerrarModal();
    }
});

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', initializeFirebase);

