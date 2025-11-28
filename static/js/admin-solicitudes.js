// admin-solicitudes.js
// Lógica para gestionar solicitudes de vendedores

let auth = null;
let db = null;
let currentUser = null;
let todasLasSolicitudes = []; // Guardar todas las solicitudes

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Admin Solicitudes script cargado');
    await initializeFirebase();
});

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
            await new Promise((resolve) => {
                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (user) {
                        currentUser = user;
                        unsubscribe();
                        resolve();
                    }
                });
                setTimeout(() => resolve(), 5000);
            });
        }

        if (!currentUser) {
            console.error('❌ No hay usuario autenticado');
            window.location.href = '/auth/login';
            return;
        }

        console.log('✅ Usuario autenticado:', currentUser.uid);

        // Verificar que el usuario sea administrador
        const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
        if (!userDoc.exists) {
            console.error('❌ Usuario no encontrado en Firestore');
            window.location.href = '/auth/login';
            return;
        }

        const userData = userDoc.data();
        const roles = userData.roles || [];
        const rolesNormalizados = Array.isArray(roles) 
            ? roles.map(r => String(r).toLowerCase().trim())
            : [String(roles).toLowerCase().trim()];
        
        if (!rolesNormalizados.includes('administrador')) {
            alert('No tienes permisos para acceder a esta página.');
            window.location.href = '/auth/perfil';
            return;
        }

        console.log('✅ Usuario administrador verificado');
        await cargarSolicitudes();
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
    }
}

async function cargarSolicitudes() {
    try {
        const solicitudesList = document.getElementById('solicitudes-list');
        solicitudesList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Cargando solicitudes...</p></div>';

        // Obtener todas las solicitudes de la colección solicitudes_vendedores
        const solicitudesSnapshot = await db.collection('solicitudes_vendedores').get();

        if (solicitudesSnapshot.empty) {
            solicitudesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>No hay solicitudes</h3>
                    <p>No hay solicitudes de vendedores</p>
                </div>
            `;
            return;
        }

        const solicitudes = [];
        solicitudesSnapshot.forEach(doc => {
            const data = doc.data();
            solicitudes.push({
                id: doc.id,
                user_id: data.user_id,
                ...data,
                verificacion: {
                    estado: data.estado || 'pendiente',
                    fecha_solicitud: data.fecha_solicitud,
                    documento_url: data.documento_url,
                    revisado_por: data.revisado_por,
                    fecha_revision: data.fecha_revision,
                    motivo_rechazo: data.motivo_rechazo
                }
            });
        });

        // Si no hay solicitudes con verificación, mostrar mensaje
        if (solicitudes.length === 0) {
            solicitudesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h3>No hay solicitudes</h3>
                    <p>No hay solicitudes de vendedores pendientes de revisión</p>
                </div>
            `;
            return;
        }

        // Ordenar: pendientes primero, luego por fecha
        solicitudes.sort((a, b) => {
            const estadoA = a.verificacion?.estado || 'pendiente';
            const estadoB = b.verificacion?.estado || 'pendiente';
            
            if (estadoA === 'pendiente' && estadoB !== 'pendiente') return -1;
            if (estadoA !== 'pendiente' && estadoB === 'pendiente') return 1;
            
            const fechaA = a.verificacion?.fecha_solicitud?.toDate() || new Date(0);
            const fechaB = b.verificacion?.fecha_solicitud?.toDate() || new Date(0);
            return fechaB - fechaA;
        });

        // Guardar todas las solicitudes
        todasLasSolicitudes = solicitudes;
        
        // Filtrar por defecto solo pendientes
        filtrarSolicitudes();
    } catch (error) {
        console.error('❌ Error cargando solicitudes:', error);
        document.getElementById('solicitudes-list').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar solicitudes</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderizarSolicitudes(solicitudes) {
    const solicitudesList = document.getElementById('solicitudes-list');
    
    if (solicitudes.length === 0) {
        solicitudesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>No hay solicitudes</h3>
                <p>No hay solicitudes de vendedores</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();
    
    solicitudes.forEach(solicitud => {
        const estado = solicitud.verificacion?.estado || 'pendiente';
        const fechaSolicitud = solicitud.verificacion?.fecha_solicitud?.toDate();
        const fechaRevision = solicitud.verificacion?.fecha_revision?.toDate();
        const documentoUrl = solicitud.verificacion?.documento_url;
        const motivoRechazo = solicitud.verificacion?.motivo_rechazo;
        const revisadoPor = solicitud.verificacion?.revisado_por;

        const card = document.createElement('div');
        card.className = `solicitud-card ${estado}`;
        
        let estadoBadge = '';
        if (estado === 'pendiente') {
            estadoBadge = '<span class="solicitud-estado estado-pendiente"><i class="fas fa-clock"></i> Pendiente</span>';
        } else if (estado === 'aprobada') {
            estadoBadge = '<span class="solicitud-estado estado-aprobada"><i class="fas fa-check-circle"></i> Aprobada</span>';
        } else if (estado === 'rechazada') {
            estadoBadge = '<span class="solicitud-estado estado-rechazada"><i class="fas fa-times-circle"></i> Rechazada</span>';
        }

        // Usar user_id en lugar de id para el enlace de detalles
        const solicitudId = solicitud.user_id || solicitud.id;
        
        card.innerHTML = `
            <div class="solicitud-header">
                <div class="solicitud-info">
                    <h3>${solicitud.nombre || 'Sin nombre'}</h3>
                    <p><i class="fas fa-envelope"></i> ${solicitud.email || 'Sin email'}</p>
                    <p><i class="fas fa-store"></i> ${solicitud.nombre_tienda || 'Sin nombre de tienda'}</p>
                    <p><i class="fas fa-map-marker-alt"></i> ${solicitud.ubicacion || 'Sin ubicación'}</p>
                    ${fechaSolicitud ? `<p><i class="fas fa-calendar"></i> Solicitud: ${fechaSolicitud.toLocaleDateString('es-MX')}</p>` : ''}
                    ${fechaRevision ? `<p><i class="fas fa-calendar-check"></i> Revisión: ${fechaRevision.toLocaleDateString('es-MX')}</p>` : ''}
                    ${revisadoPor ? `<p><i class="fas fa-user-shield"></i> Revisado por: ${revisadoPor}</p>` : ''}
                    ${motivoRechazo ? `<p style="color: #f44336;"><i class="fas fa-exclamation-triangle"></i> Motivo: ${motivoRechazo}</p>` : ''}
                </div>
                ${estadoBadge}
            </div>
            ${documentoUrl ? `
                <div class="solicitud-documento">
                    <strong><i class="fas fa-file"></i> Documento de Verificación</strong>
                    <p style="margin: 0.5rem 0; color: #718096; font-size: 0.9rem;">Haz clic en "Ver Detalles" para revisar el documento completo</p>
                </div>
            ` : ''}
            <div class="solicitud-acciones">
                <a href="/admin/solicitudes-vendedores/${solicitudId}" class="btn-accion btn-ver-documento">
                    <i class="fas fa-eye"></i> Ver Detalles
                </a>
                ${estado === 'pendiente' ? `
                    <button class="btn-accion btn-aprobar" onclick="aprobarSolicitud('${solicitudId}')">
                        <i class="fas fa-check"></i> Aprobar
                    </button>
                    <button class="btn-accion btn-rechazar" onclick="mostrarModalRechazo('${solicitudId}')">
                        <i class="fas fa-times"></i> Rechazar
                    </button>
                ` : ''}
            </div>
        `;
        
        fragment.appendChild(card);
    });

    solicitudesList.innerHTML = '';
    solicitudesList.appendChild(fragment);
}

// Función removida - ahora se usa la página de detalles

async function aprobarSolicitud(solicitudId) {
    if (!confirm('¿Estás seguro de que deseas aprobar esta solicitud de vendedor? El usuario será registrado como vendedor.')) {
        return;
    }

    try {
        // Obtener la solicitud
        const solicitudDoc = await db.collection('solicitudes_vendedores').doc(solicitudId).get();
        if (!solicitudDoc.exists) {
            alert('Solicitud no encontrada');
            return;
        }

        const solicitudData = solicitudDoc.data();
        const userId = solicitudData.user_id || solicitudId;

        // Actualizar el estado de la solicitud
        await db.collection('solicitudes_vendedores').doc(solicitudId).update({
            estado: 'aprobada',
            fecha_revision: firebase.firestore.FieldValue.serverTimestamp(),
            revisado_por: currentUser.uid,
            motivo_rechazo: null
        });

        // Obtener el usuario actual
        let userDoc = await db.collection('usuarios').doc(userId).get();
        let userData = userDoc.exists ? userDoc.data() : null;
        let rolesActuales = (userData && Array.isArray(userData.roles)) ? userData.roles.slice() : [];
        
        // Si el usuario no existe en 'usuarios', crearlo con datos de la solicitud
        if (!userDoc.exists) {
            const nuevoUsuario = {
                nombre: solicitudData.nombre || '',
                email: solicitudData.email || '',
                roles: ['vendedor'],
                rol_activo: 'vendedor',
                nombre_tienda: solicitudData.nombre_tienda || '',
                ubicacion: solicitudData.ubicacion || '',
                ubicacion_formatted: solicitudData.ubicacion_formatted || '',
                ubicacion_lat: solicitudData.ubicacion_lat || null,
                ubicacion_lng: solicitudData.ubicacion_lng || null,
                fecha_registro: firebase.firestore.FieldValue.serverTimestamp(),
                activo: true
            };
            await db.collection('usuarios').doc(userId).set(nuevoUsuario, { merge: true });
            userDoc = await db.collection('usuarios').doc(userId).get();
            userData = nuevoUsuario;
            rolesActuales = ['vendedor'];
        }
        
        // Agregar rol de vendedor si no lo tiene
        if (!rolesActuales.includes('vendedor')) {
            rolesActuales.push('vendedor');
        }

        // Actualizar/crear el usuario: agregar rol de vendedor y datos de la tienda
        await db.collection('usuarios').doc(userId).set({
            roles: rolesActuales,
            nombre_tienda: solicitudData.nombre_tienda,
            ubicacion: solicitudData.ubicacion,
            ubicacion_formatted: solicitudData.ubicacion_formatted,
            ubicacion_lat: solicitudData.ubicacion_lat,
            ubicacion_lng: solicitudData.ubicacion_lng,
            rol_activo: 'vendedor',
            solicitud_vendedor_pendiente: firebase.firestore.FieldValue.delete() // Eliminar el flag si existía
        }, { merge: true });

        // Enviar correo de aprobación
        try {
            if (typeof enviarCorreoSolicitudAprobada === 'function') {
                await enviarCorreoSolicitudAprobada(
                    solicitudData.email,
                    solicitudData.nombre || 'Usuario',
                    solicitudData.nombre_tienda || '',
                    solicitudData.ubicacion || ''
                );
            }
        } catch (emailError) {
            console.warn('⚠️ Error enviando correo de aprobación:', emailError);
            // No bloquear la aprobación si falla el correo
        }
        
        alert('✅ Solicitud aprobada correctamente. El usuario ahora tiene rol de vendedor.');
        await cargarSolicitudes();
    } catch (error) {
        console.error('❌ Error aprobando solicitud:', error);
        alert('Error al aprobar la solicitud: ' + error.message);
    }
}

function mostrarModalRechazo(solicitudId) {
    const motivo = prompt('Ingresa el motivo del rechazo:');
    if (!motivo || motivo.trim() === '') {
        alert('Debes ingresar un motivo para rechazar la solicitud');
        return;
    }

    rechazarSolicitud(solicitudId, motivo.trim());
}

async function rechazarSolicitud(solicitudId, motivo) {
    try {
        // Obtener la solicitud
        const solicitudDoc = await db.collection('solicitudes_vendedores').doc(solicitudId).get();
        if (!solicitudDoc.exists) {
            alert('Solicitud no encontrada');
            return;
        }

        const solicitudData = solicitudDoc.data();
        const userId = solicitudData.user_id || solicitudId;

        // Actualizar el estado de la solicitud
        await db.collection('solicitudes_vendedores').doc(solicitudId).update({
            estado: 'rechazada',
            fecha_revision: firebase.firestore.FieldValue.serverTimestamp(),
            revisado_por: currentUser.uid,
            motivo_rechazo: motivo
        });

        // Eliminar el flag de solicitud pendiente del usuario
        const userDoc = await db.collection('usuarios').doc(userId).get();
        if (userDoc.exists) {
            await db.collection('usuarios').doc(userId).update({
                solicitud_vendedor_pendiente: firebase.firestore.FieldValue.delete()
            });
        }

        // Enviar correo de rechazo
        try {
            if (typeof enviarCorreoSolicitudRechazada === 'function') {
                await enviarCorreoSolicitudRechazada(
                    solicitudData.email,
                    solicitudData.nombre || 'Usuario',
                    motivo
                );
            }
        } catch (emailError) {
            console.warn('⚠️ Error enviando correo de rechazo:', emailError);
            // No bloquear el rechazo si falla el correo
        }
        
        alert('❌ Solicitud rechazada');
        await cargarSolicitudes();
    } catch (error) {
        console.error('❌ Error rechazando solicitud:', error);
        alert('Error al rechazar la solicitud: ' + error.message);
    }
}

function filtrarSolicitudes() {
    const mostrarTodas = document.getElementById('mostrar-todas')?.checked || false;
    const solicitudesList = document.getElementById('solicitudes-list');
    
    if (todasLasSolicitudes.length === 0) {
        solicitudesList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>No hay solicitudes</h3>
                <p>No hay solicitudes de vendedores</p>
            </div>
        `;
        return;
    }

    let solicitudesFiltradas = todasLasSolicitudes;
    
    if (!mostrarTodas) {
        // Solo mostrar pendientes
        solicitudesFiltradas = todasLasSolicitudes.filter(s => {
            const estado = s.verificacion?.estado || 'pendiente';
            return estado === 'pendiente';
        });
        
        if (solicitudesFiltradas.length === 0) {
            solicitudesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>No hay solicitudes pendientes</h3>
                    <p>Todas las solicitudes han sido revisadas. Marca la casilla para ver todas las solicitudes.</p>
                </div>
            `;
            return;
        }
    }
    
    renderizarSolicitudes(solicitudesFiltradas);
}

// Exportar funciones para uso global
window.aprobarSolicitud = aprobarSolicitud;
window.mostrarModalRechazo = mostrarModalRechazo;
window.filtrarSolicitudes = filtrarSolicitudes;

