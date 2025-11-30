// email-helper.js
// Funciones auxiliares para enviar correos
// Los correos de aprobación/rechazo usan Flask-Mail directamente, igual que los otros correos de la aplicación

/**
 * Obtener referencia a las Firebase Functions
 */
function getFunctions() {
    if (typeof firebase === 'undefined' || !firebase.functions) {
        throw new Error('Firebase Functions no está disponible');
    }
    return firebase.functions();
}

/**
 * Enviar correo de solicitud de vendedor aprobada
 * Usa Flask-Mail directamente, igual que los otros correos
 * @param {string} email - Email del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} nombreTienda - Nombre de la tienda
 * @param {string} ubicacion - Ubicación
 */
async function enviarCorreoSolicitudAprobada(email, nombre, nombreTienda, ubicacion) {
    try {
        console.log('📧 Preparando correo de solicitud aprobada...');
        console.log('📧 Datos:', { email, nombre, nombreTienda, ubicacion });
        
        const response = await fetch('/admin/api/enviar-correo-aprobacion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
            email: email,
            nombre: nombre,
                nombre_tienda: nombreTienda || '',
                ubicacion: ubicacion || '',
                year: new Date().getFullYear().toString()
            }),
            credentials: 'same-origin'
        });
        
        console.log('📧 Respuesta recibida:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en respuesta:', response.status, errorText);
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📧 Resultado parseado:', result);
        
        if (!result.success) {
            console.error('❌ Error en resultado:', result.error);
            throw new Error(result.error || 'Error al enviar correo');
        }
        
        console.log('✅ Correo de aprobación enviado correctamente:', result);
        return result;
    } catch (error) {
        console.error('❌ Error completo enviando correo de aprobación:', error);
        console.error('❌ Stack trace:', error.stack);
        throw error;
    }
}

/**
 * Enviar correo de solicitud de vendedor rechazada
 * Usa Flask-Mail directamente, igual que los otros correos
 * @param {string} email - Email del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} motivoRechazo - Motivo del rechazo
 */
async function enviarCorreoSolicitudRechazada(email, nombre, motivoRechazo = '') {
    try {
        console.log('📧 Preparando correo de solicitud rechazada...');
        console.log('📧 Datos:', { email, nombre, motivoRechazo });
        
        const response = await fetch('/admin/api/enviar-correo-rechazo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
            email: email,
            nombre: nombre,
                motivo_rechazo: motivoRechazo || 'No se proporcionó un motivo específico.',
                year: new Date().getFullYear().toString()
            }),
            credentials: 'same-origin'
        });
        
        console.log('📧 Respuesta recibida:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en respuesta:', response.status, errorText);
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📧 Resultado parseado:', result);
        
        if (!result.success) {
            console.error('❌ Error en resultado:', result.error);
            throw new Error(result.error || 'Error al enviar correo');
        }
        
        console.log('✅ Correo de rechazo enviado correctamente:', result);
        return result;
    } catch (error) {
        console.error('❌ Error completo enviando correo de rechazo:', error);
        console.error('❌ Stack trace:', error.stack);
        throw error;
    }
}

/**
 * Enviar correo de confirmación de solicitud recibida
 * @param {string} email - Email del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} nombreTienda - Nombre de la tienda
 * @param {string} ubicacion - Ubicación
 */
async function enviarCorreoSolicitudPendiente(email, nombre, nombreTienda, ubicacion) {
    try {
        console.log('📧 Preparando correo de solicitud pendiente...');
        
        const functions = getFunctions();
        const sendSellerPendingEmail = functions.httpsCallable('sendSellerPendingEmail');
        
        const result = await sendSellerPendingEmail({
            email: email,
            nombre: nombre,
            nombreTienda: nombreTienda || '',
            ubicacion: ubicacion || ''
        });
        
        console.log('✅ Correo de confirmación enviado correctamente:', result.data);
        return result.data;
    } catch (error) {
        console.error('❌ Error enviando correo de confirmación:', error);
        throw error;
    }
}

/**
 * Enviar correo a administradores sobre nueva solicitud de vendedor
 * Usa Flask-Mail directamente
 * @param {string} solicitudId - ID de la solicitud
 * @param {string} nombre - Nombre del usuario
 * @param {string} email - Email del usuario
 * @param {string} nombreTienda - Nombre de la tienda
 * @param {string} ubicacion - Ubicación
 * @param {string} fechaSolicitud - Fecha de la solicitud (formateada)
 */
async function enviarCorreoNuevaSolicitudAdmin(solicitudId, nombre, email, nombreTienda, ubicacion, fechaSolicitud) {
    try {
        console.log('📧 Preparando correo de nueva solicitud a administradores...');
        console.log('📧 Datos:', { solicitudId, nombre, email, nombreTienda, ubicacion, fechaSolicitud });
        
        const response = await fetch('/admin/api/enviar-correo-nueva-solicitud', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                solicitud_id: solicitudId || '',
                nombre: nombre || '',
                email: email || '',
                nombre_tienda: nombreTienda || '',
                ubicacion: ubicacion || '',
                fecha_solicitud: fechaSolicitud || '',
                year: new Date().getFullYear().toString()
            }),
            credentials: 'same-origin'
        });
        
        console.log('📧 Respuesta recibida:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en respuesta:', response.status, errorText);
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📧 Resultado parseado:', result);
        
        if (!result.success) {
            console.error('❌ Error en resultado:', result.error);
            throw new Error(result.error || 'Error al enviar correo');
        }
        
        console.log('✅ Correo de nueva solicitud enviado correctamente a administradores:', result);
        return result;
    } catch (error) {
        console.error('❌ Error completo enviando correo de nueva solicitud a administradores:', error);
        console.error('❌ Stack trace:', error.stack);
        throw error;
    }
}

// Exportar funciones para uso global
window.enviarCorreoSolicitudAprobada = enviarCorreoSolicitudAprobada;
window.enviarCorreoSolicitudRechazada = enviarCorreoSolicitudRechazada;
window.enviarCorreoSolicitudPendiente = enviarCorreoSolicitudPendiente;
window.enviarCorreoNuevaSolicitudAdmin = enviarCorreoNuevaSolicitudAdmin;
