"""
Utilidades para llamar a Firebase Functions desde Flask
"""
import requests
import json
from flask import current_app

def get_firebase_functions_url(function_name):
    """Obtener la URL de una Firebase Function"""
    # Obtener project ID desde configuración o usar el por defecto
    try:
        project_id = current_app.config.get('FIREBASE_PROJECT_ID', 'agromarket-625b2')
    except RuntimeError:
        # Si no hay contexto de aplicación, usar el valor por defecto
        project_id = 'agromarket-625b2'
    region = 'us-central1'  # Región por defecto
    return f"https://{region}-{project_id}.cloudfunctions.net/{function_name}"

def call_firebase_function(function_name, data, id_token=None):
    """
    Llamar a una Firebase Function desde Flask
    
    Args:
        function_name: Nombre de la función (ej: 'sendPasswordResetCode')
        data: Datos a enviar a la función
        id_token: Token de autenticación (opcional para funciones públicas)
    
    Returns:
        dict: Respuesta de la función
    """
    url = get_firebase_functions_url(function_name)
    
    headers = {
        'Content-Type': 'application/json',
    }
    
    if id_token:
        headers['Authorization'] = f'Bearer {id_token}'
    
    try:
        response = requests.post(
            url,
            headers=headers,
            json=data,
            timeout=30
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            try:
                current_app.logger.error(
                    f"Error llamando a {function_name}: "
                    f"{response.status_code} - {response.text}"
                )
            except RuntimeError:
                print(f"Error llamando a {function_name}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        try:
            current_app.logger.error(f"Excepción llamando a {function_name}: {str(e)}")
        except RuntimeError:
            print(f"Excepción llamando a {function_name}: {str(e)}")
        return None

def send_password_reset_code_via_functions(email, code, nombre=None):
    """
    Enviar código de recuperación usando Firebase Functions
    
    Args:
        email: Email del usuario
        code: Código de 6 dígitos
        nombre: Nombre del usuario (opcional)
    
    Returns:
        bool: True si se envió correctamente
    """
    data = {
        'email': email,
        'code': code,
        'nombre': nombre
    }
    
    result = call_firebase_function('sendPasswordResetCode', data)
    
    if result and result.get('success'):
        try:
            current_app.logger.info(f"✅ Código de recuperación enviado a {email}")
        except RuntimeError:
            print(f"✅ Código de recuperación enviado a {email}")
        return True
    else:
        try:
            current_app.logger.error(f"❌ Error enviando código a {email}")
        except RuntimeError:
            print(f"❌ Error enviando código a {email}")
        return False

def verify_password_reset_code_via_functions(email, code):
    """
    Verificar código de recuperación usando Firebase Functions
    
    Args:
        email: Email del usuario
        code: Código a verificar
    
    Returns:
        dict: {'valid': bool, 'message': str, ...}
    """
    data = {
        'email': email,
        'code': code
    }
    
    result = call_firebase_function('verifyPasswordResetCode', data)
    
    if result:
        return result
    else:
        return {
            'valid': False,
            'message': 'Error al verificar código'
        }

def send_receipt_email_via_functions(email, nombre, compra_id, fecha_compra, productos, 
                                     subtotal, envio, impuestos, total, metodo_pago, direccion_entrega):
    """
    Enviar comprobante de compra usando Firebase Functions
    
    Args:
        email: Email del cliente
        nombre: Nombre del cliente
        compra_id: ID de la compra
        fecha_compra: Fecha de la compra
        productos: Lista de productos comprados
        subtotal: Subtotal de la compra
        envio: Costo de envío
        impuestos: Impuestos
        total: Total de la compra
        metodo_pago: Método de pago usado
        direccion_entrega: Diccionario con datos de dirección
    
    Returns:
        bool: True si se envió correctamente
    """
    data = {
        'email': email,
        'nombre': nombre,
        'compraId': compra_id,
        'fechaCompra': fecha_compra,
        'productos': productos,
        'subtotal': subtotal,
        'envio': envio,
        'impuestos': impuestos,
        'total': total,
        'metodoPago': metodo_pago,
        'direccionEntrega': direccion_entrega or {}
    }
    
    result = call_firebase_function('sendReceiptEmail', data)
    
    if result and result.get('success'):
        try:
            current_app.logger.info(f"✅ Comprobante de compra enviado a {email}")
        except RuntimeError:
            print(f"✅ Comprobante de compra enviado a {email}")
        return True
    else:
        try:
            current_app.logger.error(f"❌ Error enviando comprobante a {email}")
        except RuntimeError:
            print(f"❌ Error enviando comprobante a {email}")
        return False

def send_order_status_change_email_via_functions(email, nombre, compra_id, nuevo_estado, 
                                                  estado_anterior=None, productos=None, 
                                                  vendedor_nombre=None, fecha_actualizacion=None):
    """
    Enviar notificación de cambio de estado de pedido usando Firebase Functions
    
    Args:
        email: Email del cliente
        nombre: Nombre del cliente
        compra_id: ID de la compra
        nuevo_estado: Nuevo estado del pedido
        estado_anterior: Estado anterior del pedido (opcional)
        productos: Lista de productos del pedido (opcional)
        vendedor_nombre: Nombre del vendedor (opcional)
        fecha_actualizacion: Fecha de actualización (opcional)
    
    Returns:
        bool: True si se envió correctamente
    """
    data = {
        'email': email,
        'nombre': nombre,
        'compraId': compra_id,
        'nuevoEstado': nuevo_estado,
        'estadoAnterior': estado_anterior,
        'productos': productos or [],
        'vendedorNombre': vendedor_nombre,
        'fechaActualizacion': fecha_actualizacion
    }
    
    result = call_firebase_function('sendOrderStatusChangeEmail', data)
    
    if result and result.get('success'):
        try:
            current_app.logger.info(f"✅ Notificación de cambio de estado enviada a {email}")
        except RuntimeError:
            print(f"✅ Notificación de cambio de estado enviada a {email}")
        return True
    else:
        try:
            current_app.logger.error(f"❌ Error enviando notificación de cambio de estado a {email}")
        except RuntimeError:
            print(f"❌ Error enviando notificación de cambio de estado a {email}")
        return False

def send_new_seller_application_notification_via_functions(solicitud_id, nombre, email, 
                                                           nombre_tienda=None, ubicacion=None, 
                                                           fecha_solicitud=None):
    """
    Enviar notificación al administrador sobre nueva solicitud de vendedor usando Firebase Functions
    
    Args:
        solicitud_id: ID de la solicitud
        nombre: Nombre del solicitante
        email: Email del solicitante
        nombre_tienda: Nombre de la tienda (opcional)
        ubicacion: Ubicación (opcional)
        fecha_solicitud: Fecha de la solicitud (opcional)
    
    Returns:
        bool: True si se envió correctamente
    """
    data = {
        'solicitudId': solicitud_id,
        'nombre': nombre,
        'email': email,
        'nombreTienda': nombre_tienda,
        'ubicacion': ubicacion,
        'fechaSolicitud': fecha_solicitud
    }
    
    result = call_firebase_function('sendNewSellerApplicationNotification', data)
    
    if result and result.get('success'):
        try:
            current_app.logger.info(f"✅ Notificación de nueva solicitud enviada a administradores")
        except RuntimeError:
            print(f"✅ Notificación de nueva solicitud enviada a administradores")
        return True
    else:
        try:
            current_app.logger.error(f"❌ Error enviando notificación de nueva solicitud")
        except RuntimeError:
            print(f"❌ Error enviando notificación de nueva solicitud")
        return False

