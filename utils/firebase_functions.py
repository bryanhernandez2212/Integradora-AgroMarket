"""
Utilidades para llamar a Firebase Functions desde Flask
"""
import requests
import json
import os
from datetime import datetime
from flask import current_app

def get_firebase_functions_url(function_name):
    """Obtener la URL de una Firebase Function"""
    # Obtener project ID desde configuración o usar el por defecto
    try:
        project_id = current_app.config.get('FIREBASE_PROJECT_ID', 'agromarket-625b2')
        is_debug = current_app.config.get('DEBUG', False)
    except RuntimeError:
        # Si no hay contexto de aplicación, usar el valor por defecto
        project_id = os.environ.get('FIREBASE_PROJECT_ID', 'agromarket-625b2')
        is_debug = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEBUG') == 'True'
    
    # Verificar si se está usando el emulador local
    use_emulator = os.environ.get('FIREBASE_FUNCTIONS_EMULATOR_HOST')
    if use_emulator:
        # Formato: http://localhost:5001
        emulator_host = use_emulator.replace('http://', '').replace('https://', '')
        url = f"http://{emulator_host}/{project_id}/{function_name}"
        try:
            current_app.logger.info(f"🔧 Usando EMULADOR LOCAL de Firebase Functions: {url}")
        except RuntimeError:
            print(f"🔧 Usando EMULADOR LOCAL de Firebase Functions: {url}")
        return url
    
    # Usar funciones de producción
    region = 'us-central1'  # Región por defecto
    url = f"https://{region}-{project_id}.cloudfunctions.net/{function_name}"
    
    # Log para indicar si es desarrollo o producción
    try:
        if is_debug:
            current_app.logger.info(f"🔧 MODO DESARROLLO: Usando Firebase Functions de PRODUCCIÓN: {url}")
            current_app.logger.info(f"   (Para usar emulador local, configura FIREBASE_FUNCTIONS_EMULATOR_HOST=http://localhost:5001)")
        else:
            current_app.logger.info(f"🔧 MODO PRODUCCIÓN: Usando Firebase Functions: {url}")
    except RuntimeError:
        if is_debug:
            print(f"🔧 MODO DESARROLLO: Usando Firebase Functions de PRODUCCIÓN: {url}")
            print(f"   (Para usar emulador local, configura FIREBASE_FUNCTIONS_EMULATOR_HOST=http://localhost:5001)")
        else:
            print(f"🔧 MODO PRODUCCIÓN: Usando Firebase Functions: {url}")
    
    return url

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
    
    # Firebase Functions v2 onCall espera el formato: {"data": {...}}
    # Pero cuando se llama via HTTP directamente, el formato es diferente
    # Intentamos ambos formatos por compatibilidad
    
    headers = {
        'Content-Type': 'application/json',
    }
    
    if id_token:
        headers['Authorization'] = f'Bearer {id_token}'
    
    # Formato para onCall: envolver en "data"
    payload = {
        'data': data
    }
    
    try:
        # Logging detallado para debugging en producción
        try:
            current_app.logger.info(f"📞 Llamando a Firebase Function: {function_name}")
            current_app.logger.info(f"   URL: {url}")
            current_app.logger.info(f"   Payload keys: {list(data.keys())}")
            current_app.logger.info(f"   Timestamp: {datetime.now().isoformat()}")
        except RuntimeError:
            print(f"📞 Llamando a Firebase Function: {function_name}")
            print(f"   URL: {url}")
            print(f"   Payload keys: {list(data.keys())}")
        
        # Timeout aumentado a 60 segundos porque Firebase Functions puede tardar
        # especialmente al resolver DNS y conectarse a SMTP
        timeout_seconds = 60
        
        try:
            current_app.logger.info(f"⏱️  Iniciando llamada con timeout de {timeout_seconds} segundos...")
        except RuntimeError:
            print(f"⏱️  Iniciando llamada con timeout de {timeout_seconds} segundos...")
        
        start_time = datetime.now()
        
        response = requests.post(
            url,
            headers=headers,
            json=payload,  # Envolver en "data" para onCall
            timeout=timeout_seconds,  # Timeout aumentado a 60 segundos
            verify=True  # Verificar certificados SSL
        )
        
        elapsed_time = (datetime.now() - start_time).total_seconds()
        
        try:
            current_app.logger.info(f"⏱️  Llamada completada en {elapsed_time:.2f} segundos")
        except RuntimeError:
            print(f"⏱️  Llamada completada en {elapsed_time:.2f} segundos")
        
        # Logging de respuesta
        try:
            current_app.logger.info(f"📥 Respuesta de {function_name}:")
            current_app.logger.info(f"   Status Code: {response.status_code}")
            current_app.logger.info(f"   Headers: {dict(response.headers)}")
            current_app.logger.info(f"   Body (primeros 500 chars): {response.text[:500]}")
            if response.status_code == 200:
                try:
                    response_json = response.json()
                    current_app.logger.info(f"   JSON Response: {response_json}")
                except:
                    current_app.logger.warning(f"   No se pudo parsear como JSON")
        except RuntimeError:
            print(f"📥 Respuesta de {function_name}: Status: {response.status_code}")
            print(f"   Body: {response.text[:200]}")
        
        if response.status_code == 200:
            result = response.json()
            # onCall devuelve {"result": {...}} cuando es exitoso
            if 'result' in result:
                return result['result']
            # Si no tiene "result", devolver directamente
            return result
        else:
            # Para errores 500 (como DNS), fallar inmediatamente sin esperar más
            error_msg = f"Error llamando a {function_name}: {response.status_code} - {response.text[:500]}"
            try:
                current_app.logger.error(error_msg)
            except RuntimeError:
                print(error_msg)
            return None
    except requests.exceptions.Timeout:
        error_msg = f"⏱️  TIMEOUT: La función {function_name} tardó más de 60 segundos en responder"
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error(error_msg)
            current_app.logger.error("   Esto puede indicar:")
            current_app.logger.error("   - Problemas de red en Firebase Functions")
            current_app.logger.error("   - Problemas de DNS al conectar con SMTP")
            current_app.logger.error("   - El servidor SMTP está lento o no responde")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print(error_msg)
            print("   Esto puede indicar problemas de red o DNS en Firebase Functions")
            print("=" * 80)
        return None
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Error de conexión llamando a {function_name}: {str(e)}"
        try:
            current_app.logger.error(error_msg)
        except RuntimeError:
            print(error_msg)
        return None
    except Exception as e:
        error_msg = f"Excepción llamando a {function_name}: {str(e)}"
        try:
            current_app.logger.error(error_msg, exc_info=True)
        except RuntimeError:
            print(error_msg)
            import traceback
            traceback.print_exc()
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
    
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("🔐 INICIANDO ENVÍO DE CÓDIGO DE RECUPERACIÓN")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email destinatario: {email}")
        current_app.logger.info(f"🔑 Código: {code[:2]}***")
        current_app.logger.info(f"👤 Nombre: {nombre or 'N/A'}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: sendPasswordResetCode")
    except RuntimeError:
        print("=" * 80)
        print("🔐 INICIANDO ENVÍO DE CÓDIGO DE RECUPERACIÓN")
        print("=" * 80)
        print(f"📧 Email destinatario: {email}")
        print(f"🔑 Código: {code[:2]}***")
        print(f"🔍 Llamando a Firebase Function: sendPasswordResetCode")
    
    result = call_firebase_function('sendPasswordResetCode', data)
    
    try:
        current_app.logger.info(f"📥 Respuesta recibida de Firebase Functions")
        current_app.logger.info(f"   Resultado: {result}")
    except RuntimeError:
        print(f"📥 Respuesta recibida de Firebase Functions: {result}")
    
    if result and result.get('success'):
        try:
            current_app.logger.info("=" * 80)
            current_app.logger.info("✅ CÓDIGO DE RECUPERACIÓN ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            current_app.logger.info(f"📧 Email: {email}")
            current_app.logger.info(f"🔑 Código: {code[:2]}***")
            if result.get('messageId'):
                current_app.logger.info(f"📨 Message ID: {result.get('messageId')}")
            current_app.logger.info("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("✅ CÓDIGO DE RECUPERACIÓN ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            print(f"📧 Email: {email}")
            print("=" * 80)
        return True
    else:
        error_msg = result.get('error', 'Error desconocido') if result else 'No se recibió respuesta de Firebase Functions'
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ENVIANDO CÓDIGO DE RECUPERACIÓN")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error(f"❌ Error: {error_msg}")
            current_app.logger.error(f"   Resultado completo: {result}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ENVIANDO CÓDIGO DE RECUPERACIÓN")
            print(f"📧 Email: {email}")
            print(f"❌ Error: {error_msg}")
            print(f"   Resultado completo: {result}")
            print("=" * 80)
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
    
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("📧 INICIANDO ENVÍO DE COMPROBANTE DE COMPRA")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email destinatario: {email}")
        current_app.logger.info(f"📦 Compra ID: {compra_id}")
        current_app.logger.info(f"👤 Nombre cliente: {nombre}")
        current_app.logger.info(f"📊 Productos: {len(productos)}")
        current_app.logger.info(f"💰 Total: ${total:.2f}, Subtotal: ${subtotal:.2f}, Envío: ${envio:.2f}, Impuestos: ${impuestos:.2f}")
        current_app.logger.info(f"💳 Método de pago: {metodo_pago}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: sendReceiptEmail")
    except RuntimeError:
        print("=" * 80)
        print("📧 INICIANDO ENVÍO DE COMPROBANTE DE COMPRA")
        print("=" * 80)
        print(f"📧 Email destinatario: {email}")
        print(f"📦 Compra ID: {compra_id}")
        print(f"👤 Nombre cliente: {nombre}")
        print(f"📊 Productos: {len(productos)}")
        print(f"💰 Total: ${total:.2f}")
        print(f"🔍 Llamando a Firebase Function: sendReceiptEmail")
    
    result = call_firebase_function('sendReceiptEmail', data)
    
    try:
        current_app.logger.info(f"📥 Respuesta recibida de Firebase Functions")
        current_app.logger.info(f"   Resultado: {result}")
    except RuntimeError:
        print(f"📥 Respuesta recibida de Firebase Functions: {result}")
    
    if result and result.get('success'):
        try:
            current_app.logger.info("=" * 80)
            current_app.logger.info("✅ COMPROBANTE ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            current_app.logger.info(f"📧 Email: {email}")
            current_app.logger.info(f"📦 Compra ID: {compra_id}")
            if result.get('messageId'):
                current_app.logger.info(f"📨 Message ID: {result.get('messageId')}")
            current_app.logger.info("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("✅ COMPROBANTE ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            print(f"📧 Email: {email}")
            print(f"📦 Compra ID: {compra_id}")
            print("=" * 80)
        return True
    else:
        error_msg = result.get('error', 'Error desconocido') if result else 'No se recibió respuesta de Firebase Functions'
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ENVIANDO COMPROBANTE")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error(f"📦 Compra ID: {compra_id}")
            current_app.logger.error(f"❌ Error: {error_msg}")
            current_app.logger.error(f"   Resultado completo: {result}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ENVIANDO COMPROBANTE")
            print(f"📧 Email: {email}")
            print(f"❌ Error: {error_msg}")
            print(f"   Resultado completo: {result}")
            print("=" * 80)
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

