// email-helper.js
// Funciones auxiliares para enviar correos usando Firebase Functions con Nodemailer

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
 * @param {string} email - Email del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} nombreTienda - Nombre de la tienda
 * @param {string} ubicacion - Ubicación
 */
async function enviarCorreoSolicitudAprobada(email, nombre, nombreTienda, ubicacion) {
    try {
        console.log('📧 Preparando correo de solicitud aprobada...');
        
        const functions = getFunctions();
        const sendSellerApprovalEmail = functions.httpsCallable('sendSellerApprovalEmail');
        
        const result = await sendSellerApprovalEmail({
            email: email,
            nombre: nombre,
            nombreTienda: nombreTienda || '',
            ubicacion: ubicacion || ''
        });
        
        console.log('✅ Correo de aprobación enviado correctamente:', result.data);
        return result.data;
    } catch (error) {
        console.error('❌ Error enviando correo de aprobación:', error);
        throw error;
    }
}

/**
 * Enviar correo de solicitud de vendedor rechazada
 * @param {string} email - Email del usuario
 * @param {string} nombre - Nombre del usuario
 * @param {string} motivoRechazo - Motivo del rechazo
 */
async function enviarCorreoSolicitudRechazada(email, nombre, motivoRechazo = '') {
    try {
        console.log('📧 Preparando correo de solicitud rechazada...');
        
        const functions = getFunctions();
        const sendSellerRejectionEmail = functions.httpsCallable('sendSellerRejectionEmail');
        
        const result = await sendSellerRejectionEmail({
            email: email,
            nombre: nombre,
            motivoRechazo: motivoRechazo || ''
        });
        
        console.log('✅ Correo de rechazo enviado correctamente:', result.data);
        return result.data;
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
