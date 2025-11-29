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
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Error al enviar correo');
        }
        
        console.log('✅ Correo de aprobación enviado correctamente:', result);
        return result;
    } catch (error) {
        console.error('❌ Error enviando correo de aprobación:', error);
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
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Error al enviar correo');
        }
        
        console.log('✅ Correo de rechazo enviado correctamente:', result);
        return result;
    } catch (error) {
        console.error('❌ Error enviando correo de rechazo:', error);
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

// Exportar funciones para uso global
window.enviarCorreoSolicitudAprobada = enviarCorreoSolicitudAprobada;
window.enviarCorreoSolicitudRechazada = enviarCorreoSolicitudRechazada;
window.enviarCorreoSolicitudPendiente = enviarCorreoSolicitudPendiente;
