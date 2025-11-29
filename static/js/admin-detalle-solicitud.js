// admin-detalle-solicitud.js
// Lógica para mostrar el detalle de una solicitud de vendedor

let auth = null;
let db = null;
let currentUser = null;
let solicitudData = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 Admin Detalle Solicitud script cargado');
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
        
        // Obtener el ID de la solicitud desde la variable global o la URL
        let solicitudUserId = window.solicitudUserId;
        if (!solicitudUserId) {
            // Intentar obtenerlo de la URL
            const pathParts = window.location.pathname.split('/');
            const userIdFromUrl = pathParts[pathParts.length - 1];
            if (userIdFromUrl && userIdFromUrl !== 'solicitudes-vendedores') {
                solicitudUserId = userIdFromUrl;
            } else {
                alert('ID de solicitud no válido');
                window.location.href = '/admin/solicitudes-vendedores';
                return;
            }
        }

        await cargarDetalleSolicitud(solicitudUserId);
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
    }
}

async function cargarDetalleSolicitud(solicitudId) {
    try {
        // Buscar la solicitud en la colección solicitudes_vendedores
        const solicitudDoc = await db.collection('solicitudes_vendedores').doc(solicitudId).get();
        
        if (!solicitudDoc.exists) {
            alert('Solicitud no encontrada');
            window.location.href = '/admin/solicitudes-vendedores';
            return;
        }

        const data = solicitudDoc.data();
        solicitudData = {
            id: solicitudDoc.id,
            user_id: data.user_id || solicitudId,
            nombre: data.nombre,
            email: data.email,
            nombre_tienda: data.nombre_tienda,
            ubicacion: data.ubicacion,
            ubicacion_formatted: data.ubicacion_formatted,
            ubicacion_lat: data.ubicacion_lat,
            ubicacion_lng: data.ubicacion_lng,
            verificacion_vendedor: {
                estado: data.estado || 'pendiente',
                fecha_solicitud: data.fecha_solicitud,
                documento_url: data.documento_url,
                revisado_por: data.revisado_por,
                fecha_revision: data.fecha_revision,
                motivo_rechazo: data.motivo_rechazo
            }
        };

        // Obtener también la fecha de registro del usuario si existe
        const userDoc = await db.collection('usuarios').doc(solicitudData.user_id).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            solicitudData.fecha_registro = userData.fecha_registro;
        }

        renderizarDetalle();
    } catch (error) {
        console.error('❌ Error cargando detalle:', error);
        document.getElementById('loading').innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error al cargar los detalles: ${error.message}</p>
        `;
    }
}

function renderizarDetalle() {
    const loading = document.getElementById('loading');
    const content = document.getElementById('detalle-content');
    
    loading.style.display = 'none';
    content.style.display = 'block';

    const verificacion = solicitudData.verificacion_vendedor || {};
    const estado = verificacion.estado || 'pendiente';
    const fechaSolicitud = verificacion.fecha_solicitud?.toDate();
    const fechaRevision = verificacion.fecha_revision?.toDate();
    const documentoUrl = verificacion.documento_url;
    const motivoRechazo = verificacion.motivo_rechazo;
    const revisadoPor = verificacion.revisado_por;

    // Actualizar estado badge
    const estadoBadge = document.getElementById('estado-badge');
    estadoBadge.className = `estado-badge estado-${estado}`;
    if (estado === 'pendiente') {
        estadoBadge.innerHTML = '<i class="fas fa-clock"></i> Pendiente';
    } else if (estado === 'aprobada') {
        estadoBadge.innerHTML = '<i class="fas fa-check-circle"></i> Aprobada';
    } else if (estado === 'rechazada') {
        estadoBadge.innerHTML = '<i class="fas fa-times-circle"></i> Rechazada';
    }

    // Información del usuario
    const infoUsuario = document.getElementById('info-usuario');
    infoUsuario.innerHTML = `
        <div class="info-item">
            <label><i class="fas fa-user"></i> Nombre Completo</label>
            <p>${solicitudData.nombre || 'No especificado'}</p>
        </div>
        <div class="info-item">
            <label><i class="fas fa-envelope"></i> Email</label>
            <p>${solicitudData.email || 'No especificado'}</p>
        </div>
        <div class="info-item">
            <label><i class="fas fa-calendar"></i> Fecha de Registro</label>
            <p>${solicitudData.fecha_registro?.toDate()?.toLocaleDateString('es-MX') || 'No disponible'}</p>
        </div>
        <div class="info-item">
            <label><i class="fas fa-calendar-clock"></i> Fecha de Solicitud</label>
            <p>${fechaSolicitud?.toLocaleDateString('es-MX') || 'No disponible'}</p>
        </div>
    `;

    // Información de la tienda
    const infoTienda = document.getElementById('info-tienda');
    infoTienda.innerHTML = `
        <div class="info-item">
            <label><i class="fas fa-store"></i> Nombre de la Tienda</label>
            <p>${solicitudData.nombre_tienda || 'No especificado'}</p>
        </div>
        <div class="info-item">
            <label><i class="fas fa-map-marker-alt"></i> Ubicación</label>
            <p>${solicitudData.ubicacion || 'No especificada'}</p>
        </div>
        ${solicitudData.ubicacion_formatted ? `
        <div class="info-item">
            <label><i class="fas fa-map"></i> Ubicación Formateada</label>
            <p>${solicitudData.ubicacion_formatted}</p>
        </div>
        ` : ''}
        ${solicitudData.ubicacion_lat && solicitudData.ubicacion_lng ? `
        <div class="info-item">
            <label><i class="fas fa-globe"></i> Coordenadas</label>
            <p>${solicitudData.ubicacion_lat}, ${solicitudData.ubicacion_lng}</p>
        </div>
        ` : ''}
    `;

    // Documento de verificación
    const documentoContainer = document.getElementById('documento-container');
    if (documentoUrl) {
        if (documentoUrl.endsWith('.pdf') || documentoUrl.includes('.pdf')) {
            documentoContainer.innerHTML = `
                <p><strong><i class="fas fa-file-pdf"></i> Documento PDF</strong></p>
                <iframe src="${documentoUrl}" class="documento-preview" frameborder="0"></iframe>
                <div style="margin-top: 1rem;">
                    <a href="${documentoUrl}" target="_blank" class="btn-accion btn-volver">
                        <i class="fas fa-external-link-alt"></i> Abrir en nueva pestaña
                    </a>
                </div>
            `;
        } else {
            documentoContainer.innerHTML = `
                <p><strong><i class="fas fa-file-image"></i> Imagen del Documento</strong></p>
                <img src="${documentoUrl}" alt="Documento de verificación" class="documento-preview" onclick="window.open('${documentoUrl}', '_blank')" style="cursor: pointer;">
                <div style="margin-top: 1rem;">
                    <a href="${documentoUrl}" target="_blank" class="btn-accion btn-volver">
                        <i class="fas fa-external-link-alt"></i> Abrir en nueva pestaña
                    </a>
                </div>
            `;
        }
    } else {
        documentoContainer.innerHTML = `
            <p style="color: #f44336;"><i class="fas fa-exclamation-triangle"></i> No se encontró documento de verificación</p>
        `;
    }

    // Información de revisión (solo si ya fue revisada)
    if (estado !== 'pendiente') {
        const infoRevision = document.getElementById('info-revision');
        infoRevision.style.display = 'block';
        
        const infoRevisionContent = document.getElementById('info-revision-content');
        infoRevisionContent.innerHTML = `
            <div class="info-item">
                <label><i class="fas fa-user-shield"></i> Revisado por</label>
                <p>${revisadoPor || 'No especificado'}</p>
            </div>
            <div class="info-item">
                <label><i class="fas fa-calendar-check"></i> Fecha de Revisión</label>
                <p>${fechaRevision?.toLocaleDateString('es-MX') || 'No disponible'}</p>
            </div>
        `;

        if (estado === 'rechazada' && motivoRechazo) {
            const motivoContainer = document.getElementById('motivo-rechazo-container');
            motivoContainer.style.display = 'block';
            motivoContainer.innerHTML = `
                <div class="motivo-rechazo">
                    <strong><i class="fas fa-exclamation-triangle"></i> Motivo del Rechazo:</strong>
                    <p style="margin-top: 0.5rem;">${motivoRechazo}</p>
                </div>
            `;
        }
    }

    // Acciones
    const accionesContainer = document.getElementById('acciones-container');
    if (estado === 'pendiente') {
        accionesContainer.innerHTML = `
            <button class="btn-accion btn-aprobar" onclick="aprobarSolicitud()">
                <i class="fas fa-check"></i> Aprobar Solicitud
            </button>
            <button class="btn-accion btn-rechazar" onclick="mostrarModalRechazo()">
                <i class="fas fa-times"></i> Rechazar Solicitud
            </button>
            <a href="/admin/solicitudes-vendedores" class="btn-accion btn-volver">
                <i class="fas fa-arrow-left"></i> Volver a Solicitudes
            </a>
        `;
    } else {
        accionesContainer.innerHTML = `
            <a href="/admin/solicitudes-vendedores" class="btn-accion btn-volver">
                <i class="fas fa-arrow-left"></i> Volver a Solicitudes
            </a>
        `;
    }
}

async function aprobarSolicitud() {
    if (!confirm('¿Estás seguro de que deseas aprobar esta solicitud de vendedor? El usuario será registrado como vendedor.')) {
        return;
    }

    try {
        const solicitudId = solicitudData.id;
        const userId = solicitudData.user_id || solicitudId;

        // Actualizar el estado de la solicitud
        await db.collection('solicitudes_vendedores').doc(solicitudId).update({
            estado: 'aprobada',
            fecha_revision: firebase.firestore.FieldValue.serverTimestamp(),
            revisado_por: currentUser.uid,
            motivo_rechazo: null
        });

        // Obtener o crear el usuario en 'usuarios'
        let userDoc = await db.collection('usuarios').doc(userId).get();
        let userData = userDoc.exists ? userDoc.data() : null;
        let rolesActuales = (userData && Array.isArray(userData.roles)) ? userData.roles.slice() : [];
        
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
            solicitud_vendedor_pendiente: firebase.firestore.FieldValue.delete() // Eliminar el flag
        }, { merge: true });

        // Enviar correo de aprobación (en background, no bloquear si falla)
        try {
            console.log('📧 Intentando enviar correo de aprobación...');
            if (typeof window.enviarCorreoSolicitudAprobada === 'function') {
                console.log('✅ Función de correo encontrada, enviando...');
                // Enviar en background sin esperar (fire and forget)
                window.enviarCorreoSolicitudAprobada(
                    solicitudData.email,
                    solicitudData.nombre || 'Usuario',
                    solicitudData.nombre_tienda || '',
                    solicitudData.ubicacion || ''
                ).then(() => {
                    console.log('✅ Correo de aprobación enviado exitosamente');
                }).catch((emailError) => {
                    console.error('❌ Error enviando correo de aprobación:', emailError);
                });
            } else {
                console.warn('⚠️ Función enviarCorreoSolicitudAprobada no está disponible');
            }
        } catch (emailError) {
            console.error('❌ Error al intentar enviar correo de aprobación:', emailError);
            // No bloquear la aprobación si falla el correo
        }
        
        alert('✅ Solicitud aprobada correctamente. El usuario ahora tiene rol de vendedor.');
        // Recargar la página para mostrar el nuevo estado
        window.location.reload();
    } catch (error) {
        console.error('❌ Error aprobando solicitud:', error);
        alert('Error al aprobar la solicitud: ' + error.message);
    }
}

function mostrarModalRechazo() {
    const motivo = prompt('Ingresa el motivo del rechazo:');
    if (!motivo || motivo.trim() === '') {
        alert('Debes ingresar un motivo para rechazar la solicitud');
        return;
    }

    rechazarSolicitud(motivo.trim());
}

async function rechazarSolicitud(motivo) {
    try {
        const solicitudId = solicitudData.id;
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

        // Enviar correo de rechazo (en background, no bloquear si falla)
        try {
            console.log('📧 Intentando enviar correo de rechazo...');
            if (typeof window.enviarCorreoSolicitudRechazada === 'function') {
                console.log('✅ Función de correo encontrada, enviando...');
                // Enviar en background sin esperar (fire and forget)
                window.enviarCorreoSolicitudRechazada(
                    solicitudData.email,
                    solicitudData.nombre || 'Usuario',
                    motivo
                ).then(() => {
                    console.log('✅ Correo de rechazo enviado exitosamente');
                }).catch((emailError) => {
                    console.error('❌ Error enviando correo de rechazo:', emailError);
                });
            } else {
                console.warn('⚠️ Función enviarCorreoSolicitudRechazada no está disponible');
            }
        } catch (emailError) {
            console.error('❌ Error al intentar enviar correo de rechazo:', emailError);
            // No bloquear el rechazo si falla el correo
        }
        
        alert('❌ Solicitud rechazada');
        // Recargar la página para mostrar el nuevo estado
        window.location.reload();
    } catch (error) {
        console.error('❌ Error rechazando solicitud:', error);
        alert('Error al rechazar la solicitud: ' + error.message);
    }
}

// Exportar funciones para uso global
window.aprobarSolicitud = aprobarSolicitud;
window.mostrarModalRechazo = mostrarModalRechazo;

