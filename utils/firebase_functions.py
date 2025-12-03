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
    # Para Firebase Functions v2 onCall, cuando se llama vía HTTP directo,
    # el formato de la URL es diferente. Necesitamos usar el formato correcto.
    region = 'us-central1'  # Región por defecto
    
    # Para Firebase Functions v2 onCall vía HTTP directo, el formato es:
    # https://{region}-{project_id}.cloudfunctions.net/{function_name}
    # Pero también puede requerir el formato con el sufijo de la región
    url = f"https://{region}-{project_id}.cloudfunctions.net/{function_name}"
    
    # Logging para debugging
    try:
        current_app.logger.info(f"🔗 URL construida para {function_name}: {url}")
    except RuntimeError:
        print(f"🔗 URL construida para {function_name}: {url}")
    
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

def call_firebase_function(function_name, data, id_token=None, require_email=False):
    """
    Llamar a una Firebase Function desde Flask
    
    Args:
        function_name: Nombre de la función (ej: 'sendPasswordResetCode')
        data: Datos a enviar a la función
        id_token: Token de autenticación (opcional para funciones públicas)
        require_email: Si True, valida que el email esté presente (por defecto False)
    
    Returns:
        dict: Respuesta de la función
    """
    url = get_firebase_functions_url(function_name)
    
    # Firebase Functions v2 onCall cuando se llama vía HTTP directo
    # espera el formato: {"data": {...}}
    # La URL debe incluir el formato correcto para onCall
    
    headers = {
        'Content-Type': 'application/json',
    }
    
    if id_token:
        headers['Authorization'] = f'Bearer {id_token}'
    
    # Formato para onCall v2: envolver en "data"
    # Firebase Functions onCall v2 procesa automáticamente este formato
    # IMPORTANTE: Cuando se llama vía HTTP directo, Firebase Functions espera
    # que el body sea exactamente {"data": {...}}
    payload = {
        'data': data
    }
    
    # Validar email solo si es requerido
    if require_email:
        if 'email' not in data or not data.get('email'):
            try:
                current_app.logger.error("=" * 80)
                current_app.logger.error("❌ ERROR CRÍTICO: Email no encontrado en data antes de enviar")
                current_app.logger.error(f"   Función: {function_name}")
                current_app.logger.error(f"   Keys en data: {list(data.keys())}")
                current_app.logger.error(f"   Data completo: {json.dumps(data, indent=2, default=str)}")
                current_app.logger.error("=" * 80)
            except RuntimeError:
                print("=" * 80)
                print("❌ ERROR CRÍTICO: Email no encontrado en data antes de enviar")
                print(f"   Función: {function_name}")
                print(f"   Keys en data: {list(data.keys())}")
                print(f"   Data completo: {json.dumps(data, indent=2, default=str)}")
                print("=" * 80)
            return None
    
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
        
        # Logging del payload completo antes de enviar
        try:
            current_app.logger.info("=" * 80)
            current_app.logger.info("📤 PAYLOAD COMPLETO A ENVIAR A FIREBASE FUNCTIONS")
            current_app.logger.info("=" * 80)
            current_app.logger.info(f"   {json.dumps(payload, indent=2, default=str)}")
            current_app.logger.info("=" * 80)
            if 'data' in payload and 'email' in payload['data']:
                current_app.logger.info(f"   ✅ Email encontrado en payload.data: {payload['data'].get('email')}")
            elif 'email' in data:
                current_app.logger.info(f"   ✅ Email encontrado en data: {data.get('email')}")
            else:
                current_app.logger.error(f"   ❌ Email NO encontrado!")
                current_app.logger.error(f"   Keys en payload: {list(payload.keys())}")
                if 'data' in payload:
                    current_app.logger.error(f"   Keys en payload.data: {list(payload['data'].keys())}")
                current_app.logger.error(f"   Keys en data: {list(data.keys())}")
            current_app.logger.info("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("📤 PAYLOAD COMPLETO A ENVIAR A FIREBASE FUNCTIONS")
            print("=" * 80)
            print(f"   {json.dumps(payload, indent=2, default=str)}")
            print("=" * 80)
            if 'data' in payload and 'email' in payload['data']:
                print(f"   ✅ Email encontrado en payload.data: {payload['data'].get('email')}")
            elif 'email' in data:
                print(f"   ✅ Email encontrado en data: {data.get('email')}")
            else:
                print(f"   ❌ Email NO encontrado!")
                print(f"   Keys en payload: {list(payload.keys())}")
                if 'data' in payload:
                    print(f"   Keys en payload.data: {list(payload['data'].keys())}")
                print(f"   Keys en data: {list(data.keys())}")
            print("=" * 80)
        
        # Para Firebase Functions v2 onCall, cuando se llama vía HTTP directo,
        # el formato del body debe ser {"data": {...}} y se envía como JSON
        # Además, puede requerir headers adicionales
        try:
            current_app.logger.info(f"🌐 Enviando POST a: {url}")
            current_app.logger.info(f"   Headers: {headers}")
            current_app.logger.info(f"   Payload type: {type(payload)}")
        except RuntimeError:
            print(f"🌐 Enviando POST a: {url}")
            print(f"   Headers: {headers}")
        
        # Para Firebase Functions v2 onCall, cuando se llama vía HTTP directo,
        # el formato puede requerir un método diferente. Intentamos primero con POST.
        # Si obtenemos un 404, puede ser que la función no esté desplegada o que
        # el formato de URL sea incorrecto.
        try:
            current_app.logger.info(f"🌐 Enviando POST a: {url}")
            current_app.logger.info(f"   Headers: {headers}")
        except RuntimeError:
            print(f"🌐 Enviando POST a: {url}")
            print(f"   Headers: {headers}")
        
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
            try:
                result = response.json()
            except json.JSONDecodeError:
                # Si no es JSON, intentar parsear como texto
                result = {'error': response.text[:500]}
                try:
                    current_app.logger.error(f"❌ Respuesta no es JSON válido: {response.text[:500]}")
                except RuntimeError:
                    print(f"❌ Respuesta no es JSON válido: {response.text[:500]}")
                return None
            
            # onCall devuelve {"result": {...}} cuando es exitoso
            if 'result' in result:
                return result['result']
            
            # Verificar si hay un error en la respuesta (incluso con status 200)
            if isinstance(result, dict):
                if result.get('success') == False:
                    # La función devolvió un error pero con status 200
                    error_msg = result.get('message') or result.get('error') or 'Error desconocido'
                    try:
                        current_app.logger.error("=" * 80)
                        current_app.logger.error(f"❌ Firebase Function devolvió error con status 200")
                        current_app.logger.error(f"   Error: {error_msg}")
                        current_app.logger.error(f"   Respuesta completa: {result}")
                        current_app.logger.error("=" * 80)
                    except RuntimeError:
                        print("=" * 80)
                        print(f"❌ Firebase Function devolvió error con status 200")
                        print(f"   Error: {error_msg}")
                        print(f"   Respuesta completa: {result}")
                        print("=" * 80)
                    return result  # Devolver el resultado para que el código que llama pueda manejar el error
                elif result.get('success') == True:
                    # Éxito explícito
                    return result
            
            # Si no tiene "result" ni "success", devolver directamente
            return result
        else:
            # Para errores HTTP, intentar parsear el error
            error_msg = f"Error HTTP {response.status_code}"
            try:
                # Intentar parsear como JSON
                try:
                    error_json = response.json()
                    error_msg = error_json.get('error', {}).get('message', response.text[:500]) if isinstance(error_json.get('error'), dict) else str(error_json.get('error', response.text[:500]))
                except:
                    error_msg = response.text[:500]
                
                try:
                    current_app.logger.error("=" * 80)
                    current_app.logger.error(f"❌ Error HTTP {response.status_code} llamando a {function_name}")
                    current_app.logger.error(f"   URL: {url}")
                    current_app.logger.error(f"   Error: {error_msg}")
                    if response.status_code == 404:
                        current_app.logger.error("   ⚠️  ERROR 404: La función no existe o no está desplegada")
                        current_app.logger.error("   💡 SOLUCIÓN: Despliega las funciones con: firebase deploy --only functions")
                        current_app.logger.error(f"   💡 Verifica que la función '{function_name}' esté exportada en functions/index.js")
                    current_app.logger.error(f"   Response headers: {dict(response.headers)}")
                    current_app.logger.error(f"   Response body: {response.text[:1000]}")
                    current_app.logger.error("=" * 80)
                except RuntimeError:
                    print("=" * 80)
                    print(f"❌ Error HTTP {response.status_code} llamando a {function_name}")
                    print(f"   URL: {url}")
                    print(f"   Error: {error_msg}")
                    if response.status_code == 404:
                        print("   ⚠️  ERROR 404: La función no existe o no está desplegada")
                        print("   💡 SOLUCIÓN: Despliega las funciones con: firebase deploy --only functions")
                        print(f"   💡 Verifica que la función '{function_name}' esté exportada en functions/index.js")
                    print(f"   Response body: {response.text[:500]}")
                    print("=" * 80)
            except Exception as e:
                try:
                    current_app.logger.error(f"❌ Error procesando respuesta HTTP: {str(e)}")
                except RuntimeError:
                    print(f"❌ Error procesando respuesta HTTP: {str(e)}")
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
    
    result = call_firebase_function('sendPasswordResetCode', data, require_email=True)
    
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
    # Validar que el email esté presente y no esté vacío
    if not email or not email.strip():
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR: Email no proporcionado o vacío")
            current_app.logger.error(f"   Email recibido: {repr(email)}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR: Email no proporcionado o vacío")
            print(f"   Email recibido: {repr(email)}")
            print("=" * 80)
        return False
    
    data = {
        'email': email.strip(),  # Asegurar que no haya espacios
        'nombre': nombre or 'Cliente',
        'compraId': compra_id,
        'fechaCompra': fecha_compra,
        'productos': productos or [],
        'subtotal': subtotal,
        'envio': envio,
        'impuestos': impuestos,
        'total': total,
        'metodoPago': metodo_pago or 'tarjeta',
        'direccionEntrega': direccion_entrega or {}
    }
    
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("📧 INICIANDO ENVÍO DE COMPROBANTE DE COMPRA")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email destinatario: {email}")
        current_app.logger.info(f"📦 Compra ID: {compra_id}")
        current_app.logger.info(f"👤 Nombre cliente: {nombre}")
        current_app.logger.info(f"📊 Productos: {len(productos) if productos else 0}")
        current_app.logger.info(f"💰 Total: ${total:.2f}, Subtotal: ${subtotal:.2f}, Envío: ${envio:.2f}, Impuestos: ${impuestos:.2f}")
        current_app.logger.info(f"💳 Método de pago: {metodo_pago}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: sendReceiptEmail")
        current_app.logger.info(f"📤 Payload keys: {list(data.keys())}")
        current_app.logger.info(f"📤 Email en payload: {data.get('email', 'NO ENCONTRADO')}")
    except RuntimeError:
        print("=" * 80)
        print("📧 INICIANDO ENVÍO DE COMPROBANTE DE COMPRA")
        print("=" * 80)
        print(f"📧 Email destinatario: {email}")
        print(f"📦 Compra ID: {compra_id}")
        print(f"👤 Nombre cliente: {nombre}")
        print(f"📊 Productos: {len(productos) if productos else 0}")
        print(f"💰 Total: ${total:.2f}")
        print(f"🔍 Llamando a Firebase Function: sendReceiptEmail")
        print(f"📤 Payload keys: {list(data.keys())}")
        print(f"📤 Email en payload: {data.get('email', 'NO ENCONTRADO')}")
    
    result = call_firebase_function('sendReceiptEmail', data, require_email=True)
    
    try:
        current_app.logger.info(f"📥 Respuesta recibida de Firebase Functions")
        current_app.logger.info(f"   Tipo de resultado: {type(result)}")
        current_app.logger.info(f"   Resultado completo: {result}")
        if isinstance(result, dict):
            current_app.logger.info(f"   Keys en resultado: {list(result.keys())}")
            current_app.logger.info(f"   success: {result.get('success')}")
            current_app.logger.info(f"   message: {result.get('message')}")
            current_app.logger.info(f"   error: {result.get('error')}")
    except RuntimeError:
        print(f"📥 Respuesta recibida de Firebase Functions")
        print(f"   Tipo de resultado: {type(result)}")
        print(f"   Resultado completo: {result}")
        if isinstance(result, dict):
            print(f"   Keys en resultado: {list(result.keys())}")
    
    # Verificar si el resultado indica éxito
    # Firebase Functions puede devolver el resultado de diferentes formas
    if result is None:
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR: Firebase Functions devolvió None")
            current_app.logger.error("   Esto indica que la llamada falló o no se recibió respuesta")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR: Firebase Functions devolvió None")
            print("=" * 80)
        return False
    
    if isinstance(result, dict):
        if result.get('success') == True:
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
            # Si success es False o no está presente, es un error
            error_msg = 'Error desconocido'
            if isinstance(result, dict):
                error_msg = result.get('error') or result.get('message') or 'Error al enviar comprobante'
            else:
                error_msg = str(result) if result else 'No se recibió respuesta de Firebase Functions'
            
            try:
                current_app.logger.error("=" * 80)
                current_app.logger.error("❌ ERROR ENVIANDO COMPROBANTE")
                current_app.logger.error(f"📧 Email: {email}")
                current_app.logger.error(f"📦 Compra ID: {compra_id}")
                current_app.logger.error(f"❌ Error: {error_msg}")
                current_app.logger.error(f"   Resultado completo: {result}")
                current_app.logger.error(f"   Tipo de resultado: {type(result)}")
                if isinstance(result, dict):
                    current_app.logger.error(f"   Keys en resultado: {list(result.keys())}")
                current_app.logger.error("=" * 80)
            except RuntimeError:
                print("=" * 80)
                print("❌ ERROR ENVIANDO COMPROBANTE")
                print(f"📧 Email: {email}")
                print(f"📦 Compra ID: {compra_id}")
                print(f"❌ Error: {error_msg}")
                print(f"   Resultado completo: {result}")
                print(f"   Tipo de resultado: {type(result)}")
                if isinstance(result, dict):
                    print(f"   Keys en resultado: {list(result.keys())}")
                print("=" * 80)
            return False
    else:
        # Si result no es un diccionario, es un error
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ENVIANDO COMPROBANTE - Resultado no es diccionario")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error(f"📦 Compra ID: {compra_id}")
            current_app.logger.error(f"   Tipo de resultado: {type(result)}")
            current_app.logger.error(f"   Resultado: {result}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ENVIANDO COMPROBANTE - Resultado no es diccionario")
            print(f"📧 Email: {email}")
            print(f"   Tipo de resultado: {type(result)}")
            print(f"   Resultado: {result}")
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
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("📦 INICIANDO ENVÍO DE CORREO DE CAMBIO DE ESTADO")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email destinatario: {email}")
        current_app.logger.info(f"👤 Nombre cliente: {nombre}")
        current_app.logger.info(f"📦 Compra ID: {compra_id}")
        current_app.logger.info(f"🔄 Estado anterior: {estado_anterior or 'N/A'}")
        current_app.logger.info(f"🔄 Nuevo estado: {nuevo_estado}")
        current_app.logger.info(f"📊 Productos: {len(productos) if productos else 0}")
        current_app.logger.info(f"👨‍💼 Vendedor: {vendedor_nombre or 'N/A'}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: sendOrderStatusChangeEmail")
    except RuntimeError:
        print("=" * 80)
        print("📦 INICIANDO ENVÍO DE CORREO DE CAMBIO DE ESTADO")
        print("=" * 80)
        print(f"📧 Email: {email}")
        print(f"📦 Compra ID: {compra_id}")
        print(f"🔄 Estado: {estado_anterior or 'N/A'} → {nuevo_estado}")
        print(f"🔍 Llamando a Firebase Function: sendOrderStatusChangeEmail")
    
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
    
    result = call_firebase_function('sendOrderStatusChangeEmail', data, require_email=True)
    
    try:
        current_app.logger.info(f"📥 Respuesta recibida de Firebase Functions")
        current_app.logger.info(f"   Resultado: {result}")
    except RuntimeError:
        print(f"📥 Respuesta recibida de Firebase Functions: {result}")
    
    if result and result.get('success'):
        try:
            current_app.logger.info("=" * 80)
            current_app.logger.info("✅ CORREO DE CAMBIO DE ESTADO ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            current_app.logger.info(f"📧 Email: {email}")
            current_app.logger.info(f"📦 Compra ID: {compra_id}")
            current_app.logger.info(f"🔄 Estado: {estado_anterior or 'N/A'} → {nuevo_estado}")
            if result.get('messageId'):
                current_app.logger.info(f"📨 Message ID: {result.get('messageId')}")
            current_app.logger.info("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("✅ CORREO DE CAMBIO DE ESTADO ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            print(f"📧 Email: {email}")
            print(f"📦 Compra ID: {compra_id}")
            print("=" * 80)
        return True
    else:
        error_msg = result.get('error', 'Error desconocido') if result else 'No se recibió respuesta de Firebase Functions'
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ENVIANDO CORREO DE CAMBIO DE ESTADO")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error(f"📦 Compra ID: {compra_id}")
            current_app.logger.error(f"❌ Error: {error_msg}")
            current_app.logger.error(f"   Resultado completo: {result}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ENVIANDO CORREO DE CAMBIO DE ESTADO")
            print(f"📧 Email: {email}")
            print(f"❌ Error: {error_msg}")
            print(f"   Resultado completo: {result}")
            print("=" * 80)
        return False

def send_seller_approval_email_via_functions(email, nombre, nombre_tienda=None, ubicacion=None):
    """
    Enviar correo de aprobación de solicitud de vendedor usando Firebase Functions
    
    Args:
        email: Email del vendedor
        nombre: Nombre del vendedor
        nombre_tienda: Nombre de la tienda (opcional)
        ubicacion: Ubicación (opcional)
    
    Returns:
        bool: True si se envió correctamente
    """
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("✅ INICIANDO ENVÍO DE CORREO DE APROBACIÓN")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email: {email}")
        current_app.logger.info(f"👤 Nombre: {nombre}")
        current_app.logger.info(f"🏪 Tienda: {nombre_tienda or 'N/A'}")
        current_app.logger.info(f"📍 Ubicación: {ubicacion or 'N/A'}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: sendSellerApprovalEmail")
    except RuntimeError:
        print("=" * 80)
        print("✅ INICIANDO ENVÍO DE CORREO DE APROBACIÓN")
        print("=" * 80)
        print(f"📧 Email: {email}")
        print(f"🔍 Llamando a Firebase Function: sendSellerApprovalEmail")
    
    data = {
        'email': email,
        'nombre': nombre,
        'nombreTienda': nombre_tienda or '',
        'ubicacion': ubicacion or ''
    }
    
    result = call_firebase_function('sendSellerApprovalEmail', data, require_email=True)
    
    try:
        current_app.logger.info(f"📥 Respuesta recibida de Firebase Functions: {result}")
    except RuntimeError:
        print(f"📥 Respuesta recibida de Firebase Functions: {result}")
    
    if result and result.get('success'):
        try:
            current_app.logger.info("=" * 80)
            current_app.logger.info("✅ CORREO DE APROBACIÓN ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            current_app.logger.info(f"📧 Email: {email}")
            if result.get('messageId'):
                current_app.logger.info(f"📨 Message ID: {result.get('messageId')}")
            current_app.logger.info("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("✅ CORREO DE APROBACIÓN ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            print("=" * 80)
        return True
    else:
        error_msg = result.get('error', 'Error desconocido') if result else 'No se recibió respuesta de Firebase Functions'
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ENVIANDO CORREO DE APROBACIÓN")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error(f"❌ Error: {error_msg}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ENVIANDO CORREO DE APROBACIÓN")
            print(f"❌ Error: {error_msg}")
            print("=" * 80)
        return False

def send_seller_rejection_email_via_functions(email, nombre, motivo_rechazo=''):
    """
    Enviar correo de rechazo de solicitud de vendedor usando Firebase Functions
    
    Args:
        email: Email del vendedor
        nombre: Nombre del vendedor
        motivo_rechazo: Motivo del rechazo (opcional)
    
    Returns:
        bool: True si se envió correctamente
    """
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("❌ INICIANDO ENVÍO DE CORREO DE RECHAZO")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email: {email}")
        current_app.logger.info(f"👤 Nombre: {nombre}")
        current_app.logger.info(f"📝 Motivo: {motivo_rechazo or 'N/A'}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: sendSellerRejectionEmail")
    except RuntimeError:
        print("=" * 80)
        print("❌ INICIANDO ENVÍO DE CORREO DE RECHAZO")
        print("=" * 80)
        print(f"📧 Email: {email}")
        print(f"🔍 Llamando a Firebase Function: sendSellerRejectionEmail")
    
    data = {
        'email': email,
        'nombre': nombre,
        'motivoRechazo': motivo_rechazo or 'No se proporcionó un motivo específico.'
    }
    
    result = call_firebase_function('sendSellerRejectionEmail', data, require_email=True)
    
    try:
        current_app.logger.info(f"📥 Respuesta recibida de Firebase Functions: {result}")
    except RuntimeError:
        print(f"📥 Respuesta recibida de Firebase Functions: {result}")
    
    if result and result.get('success'):
        try:
            current_app.logger.info("=" * 80)
            current_app.logger.info("✅ CORREO DE RECHAZO ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            current_app.logger.info(f"📧 Email: {email}")
            if result.get('messageId'):
                current_app.logger.info(f"📨 Message ID: {result.get('messageId')}")
            current_app.logger.info("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("✅ CORREO DE RECHAZO ENVIADO EXITOSAMENTE VÍA FIREBASE FUNCTIONS")
            print("=" * 80)
        return True
    else:
        error_msg = result.get('error', 'Error desconocido') if result else 'No se recibió respuesta de Firebase Functions'
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ENVIANDO CORREO DE RECHAZO")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error(f"❌ Error: {error_msg}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ENVIANDO CORREO DE RECHAZO")
            print(f"❌ Error: {error_msg}")
            print("=" * 80)
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

def update_password_via_functions(email, new_password, code_hash=None):
    """
    Actualizar contraseña de usuario usando Firebase Functions
    
    Args:
        email: Email del usuario
        new_password: Nueva contraseña
        code_hash: Hash del código de verificación (opcional)
    
    Returns:
        dict: Resultado de la operación con 'success' y 'message'
    """
    data = {
        'email': email.strip().lower(),
        'newPassword': new_password,
    }
    
    if code_hash:
        data['codeHash'] = code_hash
    
    try:
        current_app.logger.info("=" * 80)
        current_app.logger.info("🔐 INICIANDO ACTUALIZACIÓN DE CONTRASEÑA")
        current_app.logger.info("=" * 80)
        current_app.logger.info(f"📧 Email: {email}")
        current_app.logger.info(f"🔍 Llamando a Firebase Function: updatePassword")
    except RuntimeError:
        print("=" * 80)
        print("🔐 INICIANDO ACTUALIZACIÓN DE CONTRASEÑA")
        print("=" * 80)
        print(f"📧 Email: {email}")
        print(f"🔍 Llamando a Firebase Function: updatePassword")
    
    result = call_firebase_function('updatePassword', data, require_email=True)
    
    if result and isinstance(result, dict):
        if result.get('success'):
            try:
                current_app.logger.info("✅ Contraseña actualizada exitosamente con Firebase Functions")
            except RuntimeError:
                print("✅ Contraseña actualizada exitosamente con Firebase Functions")
            return {
                'success': True,
                'message': result.get('message', 'Contraseña actualizada exitosamente')
            }
        else:
            error_msg = result.get('message') or result.get('error') or 'Error desconocido'
            try:
                current_app.logger.error("=" * 80)
                current_app.logger.error("❌ ERROR ACTUALIZANDO CONTRASEÑA")
                current_app.logger.error(f"📧 Email: {email}")
                current_app.logger.error(f"❌ Error: {error_msg}")
                current_app.logger.error(f"   Resultado completo: {result}")
                current_app.logger.error("=" * 80)
            except RuntimeError:
                print("=" * 80)
                print("❌ ERROR ACTUALIZANDO CONTRASEÑA")
                print(f"📧 Email: {email}")
                print(f"❌ Error: {error_msg}")
                print(f"   Resultado completo: {result}")
                print("=" * 80)
            return {
                'success': False,
                'message': error_msg
            }
    else:
        try:
            current_app.logger.error("=" * 80)
            current_app.logger.error("❌ ERROR ACTUALIZANDO CONTRASEÑA")
            current_app.logger.error(f"📧 Email: {email}")
            current_app.logger.error("❌ Error: No se recibió respuesta de Firebase Functions")
            current_app.logger.error(f"   Resultado completo: {result}")
            current_app.logger.error("=" * 80)
        except RuntimeError:
            print("=" * 80)
            print("❌ ERROR ACTUALIZANDO CONTRASEÑA")
            print(f"📧 Email: {email}")
            print("❌ Error: No se recibió respuesta de Firebase Functions")
            print(f"   Resultado completo: {result}")
            print("=" * 80)
        return {
            'success': False,
            'message': 'No se recibió respuesta de Firebase Functions'
        }

