from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_mail import Message, Mail
from functools import wraps
from datetime import datetime, timedelta
import secrets
import hashlib
import os
import sys

# Agregar el directorio raíz al path para importar utils
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.security import (
    sanitize_email, sanitize_string, sanitize_text_area,
    detect_xss_attempt, log_security_event
)

# Importar utilidades para Firebase Functions
FIREBASE_FUNCTIONS_AVAILABLE = False
try:
    from utils.firebase_functions import send_password_reset_code_via_functions, verify_password_reset_code_via_functions
    FIREBASE_FUNCTIONS_AVAILABLE = True
except ImportError as e:
    # Se inicializará después cuando current_app esté disponible
    pass

auth_bp = Blueprint("auth", __name__, template_folder="templates")

# Intentar importar Firebase Admin SDK
try:
    import firebase_admin
    from firebase_admin import credentials, auth as firebase_auth
    FIREBASE_ADMIN_AVAILABLE = True
except ImportError:
    FIREBASE_ADMIN_AVAILABLE = False
    print("⚠️ Firebase Admin SDK no está disponible. La recuperación de contraseña requerirá configuración adicional.")

# 🔹 Configuración para Firebase Auth
# Ya no necesitamos serializer para tokens, Firebase maneja la autenticación

# ---------------------
# Decoradores
# ---------------------
def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if "usuario_id" not in session:
            flash("Debes iniciar sesión para acceder a esta página.", "danger")
            return redirect(url_for("auth.login"))
        return f(*args, **kwargs)
    return wrapped

def role_required(rol):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            if "usuario_id" not in session:
                flash("Debes iniciar sesión para acceder a esta página.", "danger")
                return redirect(url_for("auth.login"))

            roles_usuario = session.get("roles", [])
            if isinstance(roles_usuario, str):
                roles_usuario = [roles_usuario]

            if rol.lower() not in [r.lower() for r in roles_usuario]:
                flash("No tienes permisos para acceder a esta página.", "danger")
                return redirect(url_for("auth.login"))

            return f(*args, **kwargs)
        return wrapped
    return decorator

# ---------------------
# Registro
# ---------------------
# Esta función ya no es necesaria, se movió arriba

# ---------------------
# Login
# ---------------------
@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    """Página de login - Firebase maneja la autenticación en el frontend"""
    return render_template("auth/login.html")

@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    """Página de registro - Firebase maneja el registro en el frontend"""
    return render_template("auth/register.html")

# Ruta adicional para /register (sin prefijo) - se agregará en app.py

# ---------------------
# Seleccionar rol - ELIMINADO (ya no se usa)
# ---------------------

# ---------------------
# Sincronizar rol con sesión Flask
# ---------------------
@auth_bp.route("/sincronizar-rol", methods=["POST"])
def sincronizar_rol():
    """
    Endpoint para sincronizar el rol seleccionado con la sesión de Flask.
    Recibe el token de Firebase y actualiza la sesión Flask con los roles del usuario.
    """
    try:
        data = request.get_json()
        
        # Sanitizar y validar datos
        user_id = sanitize_string(str(data.get('user_id', '')), max_length=128) if data.get('user_id') else None
        email_raw = data.get('email', '')
        email = sanitize_email(email_raw) if email_raw else ''
        nombre_raw = data.get('nombre', 'Usuario')
        nombre = sanitize_string(nombre_raw, max_length=100)
        rol_activo_raw = data.get('rol_activo', 'comprador')
        rol_activo = sanitize_string(rol_activo_raw, max_length=20)
        roles_raw = data.get('roles', [])
        
        # Validar roles (debe ser una lista de strings)
        roles = []
        if isinstance(roles_raw, list):
            for role in roles_raw:
                if isinstance(role, str):
                    sanitized_role = sanitize_string(role, max_length=20)
                    if sanitized_role and sanitized_role.lower() in ['comprador', 'vendedor', 'administrador']:
                        roles.append(sanitized_role.lower())
        
        # Detectar intentos de XSS
        if detect_xss_attempt(nombre_raw) or detect_xss_attempt(email_raw) or detect_xss_attempt(rol_activo_raw):
            log_security_event('xss_attempt', {'field': 'sincronizar_rol', 'user_id': user_id})
            return jsonify({'error': 'Se detectó contenido no permitido'}), 400
        
        if not user_id or not email:
            return jsonify({'error': 'user_id y email son requeridos'}), 400
        
        # Normalizar roles a minúsculas para comparación
        if isinstance(roles, list):
            roles_normalizados = [r.lower().strip() if isinstance(r, str) else str(r).lower().strip() for r in roles]
        else:
            roles_normalizados = [str(roles).lower().strip()] if roles else []
        
        # Establecer datos en la sesión de Flask
        session['user_id'] = user_id
        session['usuario_id'] = user_id  # Compatibilidad
        session['roles'] = roles_normalizados
        session['rol_activo'] = rol_activo.lower().strip() if rol_activo else (roles_normalizados[0] if roles_normalizados else 'comprador')
        session['nombre'] = nombre
        session['email'] = email
        
        current_app.logger.info(f'Roles sincronizados para {user_id}: {roles_normalizados}, rol_activo: {session["rol_activo"]}')
        
        return jsonify({
            'success': True,
            'message': 'Rol sincronizado correctamente',
            'rol_activo': session['rol_activo'],
            'roles': session['roles']
        })
        
    except Exception as e:
        current_app.logger.error(f'Error sincronizando rol: {str(e)}')
        return jsonify({'error': 'Error al sincronizar rol: ' + str(e)}), 500

# ---------------------
# Logout
# ---------------------
@auth_bp.route("/logout")
def logout():
    """Logout - Firebase maneja la autenticación en el frontend"""
    session.clear()
    flash("Sesión cerrada correctamente", "success")
    return redirect(url_for("auth.login"))

# ---------------------
# Perfil
# ---------------------
@auth_bp.route("/perfil", methods=["GET", "POST"])
@login_required
def perfil():
    # Datos por defecto para cuando no hay sesión
    usuario = type('Usuario', (), {
        'id': 'guest',
        'nombre': 'Usuario',
        'email': 'usuario@ejemplo.com',
        'roles': []
    })()
    roles = []
    rol_activo = None
    estadisticas = {}
    
    return render_template("auth/perfil.html", usuario=usuario, roles=roles, rol_activo=rol_activo, estadisticas=estadisticas)

# Tests eliminados

# ---------------------
# Activar rol de vendedor
# ---------------------
@auth_bp.route("/activar_rol_vendedor", methods=["GET", "POST"])
@login_required
def activar_rol_vendedor():
    roles = session.get("roles", [])
    
    if "vendedor" in [r.lower() for r in roles]:
        flash("Ya tienes el rol de vendedor activo.", "info")
        return redirect(url_for("auth.perfil"))

    if request.method == "POST":
        # Agregar rol de vendedor a la sesión
        if "vendedor" not in roles:
            roles.append("vendedor")
            session["roles"] = roles
        session["rol_activo"] = "vendedor"
        flash("Rol de vendedor activado con éxito.", "success")
        return redirect(url_for("vendedor.panel_vendedor"))

    return render_template("auth/activar_rol.html")

# =========================
# Funciones auxiliares para recuperación de contraseña
# =========================

def initialize_firebase_admin():
    """Inicializa Firebase Admin SDK si está disponible"""
    print(f"\n🔍 Inicializando Firebase Admin SDK...")
    print(f"   FIREBASE_ADMIN_AVAILABLE: {FIREBASE_ADMIN_AVAILABLE}")
    
    if not FIREBASE_ADMIN_AVAILABLE:
        print("❌ Firebase Admin SDK no está disponible (no instalado)")
        current_app.logger.warning("Firebase Admin SDK no está disponible")
        return None
    
    try:
        # Verificar si ya está inicializado
        if firebase_admin._apps:
            print("✅ Firebase Admin SDK ya está inicializado")
            return firebase_admin.get_app()
        
        # Obtener project ID - usar el mismo que en firebase-config.js (igual que en móvil)
        # Primero intentar variables de entorno (opcional), luego usar el valor hardcodeado
        project_id = os.environ.get('FIREBASE_PROJECT_ID') or \
                    os.environ.get('GOOGLE_CLOUD_PROJECT') or \
                    current_app.config.get('FIREBASE_PROJECT_ID') or \
                    'agromarket-625b2'  # Mismo valor que en static/js/firebase-config.js
        
        print(f"🔧 Project ID configurado: {project_id}")
        
        # Calcular directorio base
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        current_dir = os.getcwd()
        print(f"📁 Directorio base: {base_dir}")
        print(f"📁 Directorio actual: {current_dir}")
        
        # Buscar archivo de credenciales en varios lugares (orden de prioridad)
        possible_paths = [
            # 1. Variable de entorno (mayor prioridad)
            os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'),
            # 2. Para Docker/producción: buscar en /app (directorio común en contenedores)
            '/app/config/serviceAccountKey.json',  # Primero config/ dentro de /app
            '/app/serviceAccountKey.json',
            # 3. Archivo en config/ del proyecto (donde está en el repositorio)
            os.path.join(base_dir, 'config', 'serviceAccountKey.json'),
            # 4. Archivo en el directorio raíz del proyecto
            os.path.join(base_dir, 'serviceAccountKey.json'),
            # 5. Para producción: buscar en directorio actual de trabajo
            os.path.join(current_dir, 'config', 'serviceAccountKey.json'),
            os.path.join(current_dir, 'serviceAccountKey.json'),
            # 6. Archivo alternativo
            os.path.join(base_dir, 'firebase-service-account.json'),
        ]
        
        print(f"🔍 Buscando archivo de credenciales en {len(possible_paths)} ubicaciones...")
        cred_path = None
        for i, path in enumerate(possible_paths):
            if path:
                exists = os.path.exists(path)
                status = "✅" if exists else "❌"
                print(f"   {status} {i+1}. {path}")
                if exists and not cred_path:
                    cred_path = path
        
        if cred_path:
            print(f"📁 Usando credenciales desde: {cred_path}")
            current_app.logger.info(f"📁 Usando credenciales de Firebase desde: {cred_path}")
            cred = credentials.Certificate(cred_path)
            
            # Inicializar con credenciales y project ID
            app = firebase_admin.initialize_app(cred, {
                'projectId': project_id
            })
            print(f"✅ Firebase Admin SDK inicializado correctamente (project: {project_id})")
            current_app.logger.info(f"✅ Firebase Admin SDK inicializado correctamente (project: {project_id})")
            return app
        else:
            print("⚠️ No se encontró archivo de credenciales en ninguna ubicación")
            # Intentar usar credenciales por defecto o inicializar con project ID
            try:
                # Asegurar que project_id esté definido (usar el mismo que en móvil)
                if 'project_id' not in locals():
                    project_id = os.environ.get('FIREBASE_PROJECT_ID') or \
                                os.environ.get('GOOGLE_CLOUD_PROJECT') or \
                                current_app.config.get('FIREBASE_PROJECT_ID') or \
                                'agromarket-625b2'  # Mismo valor que en static/js/firebase-config.js
                
                print(f"🔧 Intentando inicializar con project ID: {project_id}")
                current_app.logger.info(f"🔧 Intentando inicializar Firebase Admin con project ID: {project_id}")
                
                # IMPORTANTE: Siempre pasar projectId, incluso sin credenciales
                # Firebase Admin SDK requiere projectId para funcionar correctamente
                app = firebase_admin.initialize_app(options={
                    'projectId': project_id
                })
                
                print(f"✅ Firebase Admin SDK inicializado con project ID: {project_id} (sin archivo de credenciales)")
                current_app.logger.info(f"✅ Firebase Admin SDK inicializado con project ID: {project_id} (sin archivo de credenciales)")
                current_app.logger.warning("⚠️ Usando credenciales por defecto del entorno (Application Default Credentials)")
                return app
                
            except Exception as default_error:
                # Si falla, intentar con variable de entorno GOOGLE_CLOUD_PROJECT
                print(f"⚠️ Error inicializando con opciones, intentando con GOOGLE_CLOUD_PROJECT...")
                print(f"   Error: {str(default_error)}")
                
                # Establecer variable de entorno si no está configurada
                if not os.environ.get('GOOGLE_CLOUD_PROJECT'):
                    os.environ['GOOGLE_CLOUD_PROJECT'] = project_id
                    print(f"🔧 Establecido GOOGLE_CLOUD_PROJECT={project_id}")
                
                try:
                    # Intentar nuevamente después de establecer la variable de entorno
                    app = firebase_admin.initialize_app(options={
                        'projectId': project_id
                    })
                    print(f"✅ Firebase Admin SDK inicializado con GOOGLE_CLOUD_PROJECT={project_id}")
                    current_app.logger.info(f"✅ Firebase Admin SDK inicializado con GOOGLE_CLOUD_PROJECT={project_id}")
                    return app
                except Exception as final_error:
                    print(f"❌ Error final inicializando Firebase Admin: {str(final_error)}")
                    current_app.logger.error(f"❌ Error inicializando Firebase Admin: {str(final_error)}")
                    current_app.logger.warning("⚠️ Firebase Admin no está configurado correctamente.")
                    current_app.logger.warning(f"   Project ID usado: {project_id}")
                    current_app.logger.warning(f"   GOOGLE_CLOUD_PROJECT: {os.environ.get('GOOGLE_CLOUD_PROJECT', 'NO CONFIGURADO')}")
                    return None
    except Exception as e:
        print(f"❌ Error inicializando Firebase Admin: {str(e)}")
        print(f"   Tipo: {type(e).__name__}")
        import traceback
        print(f"   Traceback: {traceback.format_exc()}")
        current_app.logger.error(f"❌ Error inicializando Firebase Admin: {str(e)}")
        return None

def get_firestore_client():
    """Obtiene el cliente de Firestore a través de Firebase Admin"""
    try:
        app = initialize_firebase_admin()
        if app:
            from firebase_admin import firestore
            return firestore.client()
        return None
    except Exception as e:
        current_app.logger.error(f"Error obteniendo Firestore client: {str(e)}")
        return None

def generate_reset_code(email):
    """Genera un código numérico de 6 dígitos para recuperación de contraseña"""
    # Generar código numérico de 6 dígitos
    code = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
    
    # Crear hash del código para almacenarlo de forma segura
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    
    # Fecha de expiración (15 minutos desde ahora)
    expires_at = datetime.now() + timedelta(minutes=15)
    
    return {
        'code': code,  # Código en texto plano (solo para enviar por correo)
        'code_hash': code_hash,  # Hash para almacenar en BD
        'email': email,
        'expires_at': expires_at,
        'used': False,
        'verified': False,  # Indica si el código fue verificado
        'created_at': datetime.now()
    }

def save_reset_code_to_firestore(code_data):
    """Guarda el código de recuperación en Firestore"""
    try:
        db = get_firestore_client()
        if not db:
            return False
        
        # Guardar en colección 'password_reset_codes'
        doc_ref = db.collection('password_reset_codes').document(code_data['code_hash'])
        doc_ref.set({
            'email': code_data['email'],
            'code_hash': code_data['code_hash'],
            'expires_at': code_data['expires_at'],
            'created_at': code_data['created_at'],
            'used': False,
            'verified': False
        })
        return True
    except Exception as e:
        current_app.logger.error(f"Error guardando código en Firestore: {str(e)}")
        return False

def validate_reset_code(email, code):
    """Valida un código de recuperación de contraseña"""
    print(f"\n🔍 Validando código para {email[:3]}***...")
    print(f"   Código recibido: {code}")
    
    # PRIMERO intentar desde sesión (siempre, no solo en DEBUG)
    # Esto es más confiable y rápido
    session_code = session.get('reset_password_code')
    session_email = session.get('reset_password_email', '').lower()
    session_expires = session.get('reset_password_code_expires')
    session_code_hash = session.get('reset_password_code_hash')
    
    print(f"   Código en sesión: {session_code}")
    print(f"   Email en sesión: {session_email}")
    print(f"   Email a validar: {email.lower()}")
    print(f"   Expira en sesión: {session_expires}")
    
    # Validar código desde sesión
    if session_code and session_code == code:
        # Verificar email
        if session_email and session_email == email.lower():
            # Verificar expiración
            if session_expires:
                try:
                    expires = datetime.fromisoformat(session_expires)
                    if datetime.now() < expires:
                        print("✅ Código validado desde sesión")
                        current_app.logger.info("✅ Código validado desde sesión")
                        return {
                            'code': code,
                            'code_hash': session_code_hash or hashlib.sha256(code.encode()).hexdigest(),
                            'email': email,
                            'expires_at': expires,
                            'used': False,
                            'verified': False
                        }
                    else:
                        print(f"❌ Código en sesión expirado. Ahora: {datetime.now()}, Expira: {expires}")
                        current_app.logger.warning(f"Código expirado. Expira: {expires}, Ahora: {datetime.now()}")
                except Exception as e:
                    print(f"⚠️ Error validando fecha de expiración: {str(e)}")
                    import traceback
                    print(traceback.format_exc())
            else:
                print("⚠️ No hay fecha de expiración en sesión")
        else:
            print(f"❌ Email no coincide: sesión='{session_email}' vs recibido='{email.lower()}'")
    else:
        print(f"❌ Código no coincide: sesión='{session_code}' vs recibido='{code}'")
    
    # Intentar desde Firestore
    print("🔍 Buscando código en Firestore...")
    try:
        db = get_firestore_client()
        if not db:
            print("⚠️ Firestore no disponible, usando solo sesión")
            return None
        
        # Crear hash del código recibido
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        
        # Buscar el código en Firestore
        doc_ref = db.collection('password_reset_codes').document(code_hash)
        doc = doc_ref.get()
        
        if not doc.exists:
            print(f"❌ Código no encontrado en Firestore (hash: {code_hash[:10]}...)")
            return None
        
        code_data = doc.to_dict()
        print(f"✅ Código encontrado en Firestore")
        
        # Verificar que el email coincida
        stored_email = code_data.get('email', '').lower()
        if stored_email != email.lower():
            print(f"❌ Email no coincide: '{stored_email}' != '{email.lower()}'")
            return None
        
        print(f"✅ Email coincide")
        
        # Verificar si el código ha sido usado
        if code_data.get('used', False):
            return None
        
        # Verificar si el código ha expirado
        expires_at = code_data.get('expires_at')
        if expires_at:
            try:
                # Si es un timestamp de Firestore
                if hasattr(expires_at, 'timestamp'):
                    expires = expires_at.to_datetime() if hasattr(expires_at, 'to_datetime') else datetime.fromtimestamp(expires_at.timestamp())
                elif isinstance(expires_at, datetime):
                    expires = expires_at
                else:
                    expires = datetime.fromtimestamp(expires_at.timestamp())
                
                # Comparar sin timezone si es necesario
                if expires.tzinfo:
                    expires = expires.replace(tzinfo=None)
                
                if datetime.now() > expires:
                    return None
            except Exception as e:
                current_app.logger.error(f"Error procesando fecha de expiración: {str(e)}")
                return None
        
        return code_data
    except Exception as e:
        current_app.logger.error(f"Error validando código: {str(e)}")
        return None

def mark_code_as_verified(code_hash):
    """Marca un código como verificado (para permitir cambio de contraseña)"""
    try:
        db = get_firestore_client()
        if not db:
            return False
        
        doc_ref = db.collection('password_reset_codes').document(code_hash)
        doc_ref.update({'verified': True})
        return True
    except Exception as e:
        current_app.logger.error(f"Error marcando código como verificado: {str(e)}")
        return False

def mark_code_as_used(code_hash):
    """Marca un código como usado"""
    try:
        db = get_firestore_client()
        if not db:
            return False
        
        doc_ref = db.collection('password_reset_codes').document(code_hash)
        doc_ref.update({'used': True})
        return True
    except Exception as e:
        current_app.logger.error(f"Error marcando código como usado: {str(e)}")
        return False

def get_user_by_email(email):
    """Obtiene un usuario de Firebase Auth por email
    
    NOTA: Esta función solo se usa como fallback. En producción,
    las verificaciones se hacen directamente en Firebase Functions.
    """
    # Intentar con Firebase Admin SDK solo si está disponible
    if not FIREBASE_ADMIN_AVAILABLE:
        return None
    
    try:
        app = initialize_firebase_admin()
        if not app:
            return None
        
        # Buscar usuario por email
        user = firebase_auth.get_user_by_email(email)
        return user
    except firebase_auth.UserNotFoundError:
        return None
    except Exception as e:
        # No loggear error como crítico, ya que Firebase Functions manejará esto
        current_app.logger.debug(f"Firebase Admin no disponible para verificar usuario: {str(e)}")
        return None

def update_user_password_via_rest_api(email, new_password):
    """Actualiza la contraseña usando Firebase REST API (sin Admin SDK)
    
    Usa el endpoint de Firebase Auth REST API para actualizar la contraseña.
    Requiere obtener un token de acceso primero.
    """
    try:
        import requests
        
        # Obtener API key de Firebase
        api_key = current_app.config.get('FIREBASE_API_KEY') or 'AIzaSyDZWmY0ggZthOKv17yHH57pkXsie_U2YnI'
        project_id = current_app.config.get('FIREBASE_PROJECT_ID') or 'agromarket-625b2'
        
        # Firebase Auth REST API endpoint para actualizar contraseña
        # Necesitamos autenticar al usuario primero, pero como no tenemos sesión,
        # usaremos el método de "sendOobCode" y luego "resetPassword"
        # Sin embargo, esto requiere un código OOB de Firebase, no nuestro código personalizado
        
        # Alternativa: Usar el endpoint de actualización de perfil con un token
        # Pero necesitamos que el usuario esté autenticado
        
        current_app.logger.warning("update_user_password_via_rest_api: Requiere autenticación del usuario")
        print("⚠️ REST API requiere autenticación del usuario (no disponible sin Admin SDK)")
        return False
    except Exception as e:
        current_app.logger.error(f"Error en update_user_password_via_rest_api: {str(e)}")
        return False

def update_user_password(email, new_password):
    """Actualiza la contraseña de un usuario en Firebase Auth
    
    NOTA: Esta función intenta usar Firebase Admin SDK si está disponible,
    pero en producción, el cambio de contraseña se maneja en el frontend
    con el código de verificación.
    """
    try:
        print(f"\n🔐 Intentando actualizar contraseña para {email[:3]}***")
        print(f"   FIREBASE_ADMIN_AVAILABLE: {FIREBASE_ADMIN_AVAILABLE}")
        
        # Intentar primero con Firebase Admin SDK si está disponible
        if FIREBASE_ADMIN_AVAILABLE:
            print("🔍 Inicializando Firebase Admin SDK...")
            app = initialize_firebase_admin()
            if app:
                print("✅ Firebase Admin SDK inicializado")
                
                # Obtener usuario por email
                print(f"🔍 Buscando usuario por email: {email}")
                try:
                    user = get_user_by_email(email)
                    if user:
                        print(f"✅ Usuario encontrado: {user.uid}")
                        
                        # Actualizar contraseña
                        print("🔄 Actualizando contraseña en Firebase Auth...")
                        try:
                            firebase_auth.update_user(user.uid, password=new_password)
                            print("✅ Contraseña actualizada exitosamente con Admin SDK")
                            current_app.logger.info(f"✅ Contraseña actualizada para {email}")
                            return True
                        except Exception as update_error:
                            error_msg = f"Error al actualizar contraseña: {str(update_error)}"
                            print(f"❌ {error_msg}")
                            print(f"   Tipo: {type(update_error).__name__}")
                            current_app.logger.error(error_msg)
                            current_app.logger.error(f"Tipo de error: {type(update_error).__name__}")
                            import traceback
                            current_app.logger.error(traceback.format_exc())
                            return False
                    else:
                        print("⚠️ Usuario no encontrado con Admin SDK")
                        current_app.logger.warning(f"⚠️ Usuario no encontrado para {email}")
                        # Intentar buscar por email sin importar mayúsculas/minúsculas
                        try:
                            # Firebase Admin SDK busca por email exacto, intentar con email en minúsculas
                            email_lower = email.lower().strip()
                            if email_lower != email:
                                print(f"🔍 Intentando buscar con email en minúsculas: {email_lower}")
                                user = firebase_auth.get_user_by_email(email_lower)
                                if user:
                                    print(f"✅ Usuario encontrado con email en minúsculas: {user.uid}")
                                    firebase_auth.update_user(user.uid, password=new_password)
                                    print("✅ Contraseña actualizada exitosamente")
                                    current_app.logger.info(f"✅ Contraseña actualizada para {email_lower}")
                                    return True
                        except Exception as lower_error:
                            print(f"⚠️ No se encontró usuario con email en minúsculas: {str(lower_error)}")
                        return False
                except Exception as user_error:
                    error_msg = f"Error obteniendo usuario: {str(user_error)}"
                    print(f"❌ {error_msg}")
                    print(f"   Tipo: {type(user_error).__name__}")
                    current_app.logger.error(error_msg)
                    import traceback
                    current_app.logger.error(traceback.format_exc())
                    return False
            else:
                print("⚠️ Firebase Admin SDK no se pudo inicializar")
                current_app.logger.warning("⚠️ Firebase Admin SDK no se pudo inicializar")
                return False
        else:
            # Si Admin SDK no está disponible, mostrar advertencia
            print("⚠️ Firebase Admin SDK no disponible - el cambio de contraseña debe hacerse desde el frontend")
            current_app.logger.warning("Firebase Admin SDK no disponible para cambio de contraseña")
            return False
        
    except Exception as e:
        error_msg = f"Error actualizando contraseña: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Tipo: {type(e).__name__}")
        current_app.logger.error(error_msg)
        current_app.logger.error(f"Tipo de error: {type(e).__name__}")
        import traceback
        current_app.logger.error(traceback.format_exc())
        return False

# =========================
# Olvidé contraseña
# =========================

@auth_bp.route('/forgot_password', methods=['GET', 'POST'])
def forgot_password():
    current_app.logger.info("=" * 60)
    current_app.logger.info("📧 SOLICITUD DE RECUPERACIÓN DE CONTRASEÑA")
    current_app.logger.info("=" * 60)
    
    if request.method == 'POST':
        # Verificar si viene email o código
        email = request.form.get('email', '').strip().lower()
        code = request.form.get('code', '').strip()
        
        current_app.logger.info(f"Método: POST | Email recibido: {email[:3]}*** | Código recibido: {'Sí' if code else 'No'}")
        
        # Si viene código, es la segunda etapa (verificar código)
        if code:
            current_app.logger.info(f"🔐 Etapa 2: Verificando código para {email[:3]}***")
            # Obtener email de la sesión
            email = session.get('reset_password_email', '')
            if not email:
                current_app.logger.warning("⚠️ Sesión expirada - no hay email en sesión")
                flash("Sesión expirada. Por favor, solicita un nuevo código.", "danger")
                session.pop('reset_password_email', None)
                return render_template('auth/forgot_password.html', step='email')
            
            # Validar código
            code_data = validate_reset_code(email, code)
            if not code_data:
                current_app.logger.warning(f"❌ Código inválido o expirado para {email[:3]}***")
                flash("El código es inválido o ha expirado. Por favor, verifica el código o solicita uno nuevo.", "danger")
                return render_template('auth/forgot_password.html', step='code', email=email)
            
            # Marcar código como verificado
            code_hash = code_data.get('code_hash')
            mark_code_as_verified(code_hash)
            
            # Guardar información en sesión para el cambio de contraseña
            session['reset_password_verified'] = True
            session['reset_password_code_hash'] = code_hash
            
            current_app.logger.info(f"✅ Código verificado correctamente para {email[:3]}***")
            # Redirigir a página de cambio de contraseña
            flash("Código verificado correctamente. Ahora puedes cambiar tu contraseña.", "success")
            return redirect(url_for('auth.reset_password'))
        
        # Primera etapa: solicitar email
        if not email:
            current_app.logger.warning("⚠️ Email vacío recibido")
            flash("Por favor, ingresa tu correo electrónico.", "danger")
            return render_template('auth/forgot_password.html', step='email')
        
        current_app.logger.info(f"📧 Etapa 1: Procesando solicitud para {email}")
        
        # NOTA: No verificamos si el usuario existe por seguridad (mejores prácticas).
        # Firebase Functions manejará la verificación y envío del correo.
        # Por seguridad, siempre mostramos el mismo mensaje.
        
        # Generar código de recuperación
        current_app.logger.info("🔑 Generando código de recuperación...")
        code_data = generate_reset_code(email)
        current_app.logger.info(f"✅ Código generado: {code_data['code']}")
        
        # Guardar código en sesión (usado para verificación)
        session['reset_password_code'] = code_data['code']
        session['reset_password_code_expires'] = code_data['expires_at'].isoformat()
        session['reset_password_code_hash'] = code_data['code_hash']
        session['reset_password_email'] = email
        current_app.logger.info(f"✅ Código guardado en sesión: {code_data['code']}")
        
        # NOTA: El código también se guardará en Firestore desde Firebase Functions
        # No necesitamos Firebase Admin SDK aquí
        
        # Enviar correo con Firebase Functions (preferido) o Flask-Mail (respaldo)
        print("\n" + "=" * 60)
        print("📧 INICIANDO ENVÍO DE CORREO")
        print("=" * 60)
        
        # Intentar usar Firebase Functions primero
        try:
            from utils.firebase_functions import send_password_reset_code_via_functions
            use_firebase_functions = True
        except ImportError:
            use_firebase_functions = False
        
        if use_firebase_functions:
            try:
                print("🔍 Intentando enviar con Firebase Functions...")
                # Nota: El nombre se obtendrá en Firebase Functions si es necesario
                # No necesitamos Firebase Admin SDK aquí
                
                success = send_password_reset_code_via_functions(
                    email=email,
                    code=code_data['code'],
                    nombre=None  # Firebase Functions puede obtenerlo si lo necesita
                )
                
                if success:
                    print("✅ Correo enviado exitosamente con Firebase Functions")
                    current_app.logger.info(f"✅ Código de recuperación enviado a {email} vía Firebase Functions")
                    flash("Se ha enviado un código de verificación a tu correo electrónico.", "success")
                    return render_template('auth/forgot_password.html', step='code', email=email)
                else:
                    print("⚠️ Firebase Functions falló, intentando con Flask-Mail...")
                    current_app.logger.warning("⚠️ Firebase Functions falló, usando Flask-Mail como respaldo")
            except Exception as e:
                print(f"⚠️ Error con Firebase Functions: {str(e)}")
                current_app.logger.warning(f"⚠️ Error con Firebase Functions: {str(e)}, usando Flask-Mail como respaldo")
        
        # Respaldo: usar Flask-Mail
        try:
            # Obtener la instancia de Mail desde la extensión de Flask
            print("🔍 Verificando configuración de Flask-Mail...")
            mail = current_app.extensions.get('mail')
            if not mail:
                error_msg = "❌ Flask-Mail no está configurado correctamente"
                print(error_msg)
                current_app.logger.error(error_msg)
                # En modo debug, mostrar el código en consola
                if current_app.config.get('DEBUG'):
                    print(f"⚠️ CÓDIGO DE VERIFICACIÓN (modo debug): {code_data['code']}")
                    current_app.logger.warning(f"⚠️ CÓDIGO DE VERIFICACIÓN (modo debug): {code_data['code']}")
                    flash(f"⚠️ MODO DEBUG: Código de verificación: {code_data['code']}. El correo no se pudo enviar.", "warning")
                    return render_template('auth/forgot_password.html', step='code', email=email)
                flash("Error: Servicio de correo no disponible. Por favor, contacta al administrador.", "danger")
                return render_template('auth/forgot_password.html', step='email')
            
            print("✅ Flask-Mail está configurado")
            
            # Verificar configuración de correo
            mail_server = current_app.config.get('MAIL_SERVER')
            mail_port = current_app.config.get('MAIL_PORT')
            mail_username = current_app.config.get('MAIL_USERNAME')
            mail_use_tls = current_app.config.get('MAIL_USE_TLS')
            
            print(f"📧 Configuración SMTP:")
            print(f"   Servidor: {mail_server}")
            print(f"   Puerto: {mail_port}")
            print(f"   TLS: {mail_use_tls}")
            print(f"   Usuario: {mail_username}")
            print(f"   Destinatario: {email}")
            
            current_app.logger.info(f"Enviando correo a {email} desde {mail_username} vía {mail_server}:{mail_port}")
            
            # Intentar múltiples configuraciones SMTP si falla la primera
            smtp_configs = [
                {
                    'server': mail_server,
                    'port': mail_port,
                    'use_tls': mail_use_tls,
                    'use_ssl': False
                },
                # Alternativa 1: Puerto 465 con SSL (si el puerto 587 está bloqueado)
                {
                    'server': mail_server,
                    'port': 465,
                    'use_tls': False,
                    'use_ssl': True
                },
                # Alternativa 2: Puerto 25 (si está disponible, aunque menos seguro)
                {
                    'server': mail_server,
                    'port': 25,
                    'use_tls': False,
                    'use_ssl': False
                }
            ]
            
            email_sent = False
            last_error = None
            
            for config_index, smtp_config in enumerate(smtp_configs):
                try:
                    # Si ya se envió exitosamente, salir
                    if email_sent:
                        break
                    
                    # Reconfigurar Flask-Mail con esta configuración
                    current_app.config['MAIL_PORT'] = smtp_config['port']
                    current_app.config['MAIL_USE_TLS'] = smtp_config['use_tls']
                    current_app.config['MAIL_USE_SSL'] = smtp_config['use_ssl']
                    
                    # Reinicializar mail con nueva configuración
                    from flask_mail import Mail
                    mail = Mail(current_app)
                    
                    if config_index > 0:
                        print(f"🔄 Intentando configuración alternativa {config_index + 1}: puerto {smtp_config['port']} ({'SSL' if smtp_config['use_ssl'] else 'TLS' if smtp_config['use_tls'] else 'sin cifrado'})...")
                    
                    # Crear mensaje de correo
                    sender = current_app.config.get('MAIL_DEFAULT_SENDER', 'AgroMarket <agromarket559@gmail.com>')
                    msg = Message(
                        subject='🔐 Código de Verificación - AgroMarket',
                        recipients=[email],
                        sender=sender,
                        html=f'''
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                        .header {{ background: linear-gradient(135deg, #2e8b57 0%, #228B22 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                        .header h1 {{ margin: 0; font-size: 28px; }}
                        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                        .code-box {{ background: white; border: 3px solid #2e8b57; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0; }}
                        .code {{ font-size: 48px; font-weight: bold; color: #2e8b57; letter-spacing: 10px; font-family: 'Courier New', monospace; }}
                        .warning {{ background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; border-radius: 4px; margin: 20px 0; }}
                        .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🍃 AgroMarket</h1>
                            <p style="margin: 10px 0 0 0; font-size: 18px;">Código de Verificación</p>
                        </div>
                        
                        <div class="content">
                            <p>Hola,</p>
                            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en AgroMarket.</p>
                            <p>Utiliza el siguiente código de verificación para continuar:</p>
                            
                            <div class="code-box">
                                <div class="code">{code_data['code']}</div>
                            </div>
                            
                            <div class="warning">
                                <strong>⚠️ Importante:</strong>
                                <ul>
                                    <li>Este código expirará en 15 minutos</li>
                                    <li>Si no solicitaste este cambio, ignora este correo</li>
                                    <li>No compartas este código con nadie</li>
                                </ul>
                            </div>
                            
                            <div class="footer">
                                <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
                                <p>© {datetime.now().year} AgroMarket - Todos los derechos reservados</p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
                '''
                    )
                    
                    # Intentar enviar el correo
                    print(f"📤 Enviando correo a {email}...")
                    print(f"   Código: {code_data['code']}")
                    print(f"   Configuración: puerto {smtp_config['port']}, {'SSL' if smtp_config['use_ssl'] else 'TLS' if smtp_config['use_tls'] else 'sin cifrado'}")
                    mail.send(msg)
                    print("✅ ¡Correo enviado exitosamente!")
                    print("=" * 60 + "\n")
                    current_app.logger.info(f"✅ Correo enviado exitosamente a {email} (puerto {smtp_config['port']})")
                    email_sent = True
                    flash("✅ Correo enviado exitosamente. Por favor, revisa tu bandeja de entrada e ingresa el código de verificación.", "success")
                    return render_template('auth/forgot_password.html', step='code', email=email)
                    
                except (OSError, ConnectionError, Exception) as e:
                    last_error = e
                    error_type = type(e).__name__
                    error_msg = str(e)
                    
                    # Si es error de red, intentar siguiente configuración
                    if isinstance(e, (OSError, ConnectionError)) or 'Network is unreachable' in error_msg or 'Connection refused' in error_msg or 'errno 101' in error_msg.lower():
                        print(f"⚠️ Error de red con puerto {smtp_config['port']}: {error_msg}")
                        current_app.logger.warning(f"⚠️ Error de red con puerto {smtp_config['port']}: {error_msg}")
                        if config_index < len(smtp_configs) - 1:
                            print(f"   Intentando siguiente configuración...")
                            continue
                    
                    # Si es otro tipo de error y es la última configuración, reportarlo
                    if config_index == len(smtp_configs) - 1:
                        print(f"\n❌ ERROR AL ENVIAR CORREO (todos los intentos fallaron):")
                        print(f"   Tipo: {error_type}")
                        print(f"   Mensaje: {error_msg}")
                        print(f"   Código generado: {code_data['code']}")
                        print("=" * 60 + "\n")
                        current_app.logger.error(f"❌ Error enviando correo a {email}: {error_msg}")
                        current_app.logger.error(f"Tipo de error: {error_type}")
                        break
            
            # Si llegamos aquí y no se envió, todos los intentos fallaron
            if not email_sent:
                error_msg = str(last_error) if last_error else "Error desconocido"
                error_type = type(last_error).__name__ if last_error else "UnknownError"
                
                # FALLBACK: Si el hosting bloquea SMTP, mostrar código en logs y permitir continuar
                # Esto permite que el usuario recupere su contraseña mientras se resuelve el problema del hosting
                is_network_error = last_error and (
                    'Network is unreachable' in error_msg or 
                    'Connection refused' in error_msg or 
                    'errno 101' in error_msg.lower() or
                    isinstance(last_error, (OSError, ConnectionError))
                )
                
                if is_network_error:
                    # Como el hosting bloquea SMTP, registrar código en logs como fallback temporal
                    print("\n" + "=" * 60)
                    print("⚠️ FALLBACK: Hosting bloquea conexiones SMTP")
                    print("=" * 60)
                    print(f"⚠️ CÓDIGO DE VERIFICACIÓN PARA {email}:")
                    print(f"   {code_data['code']}")
                    print("=" * 60)
                    print("⚠️ IMPORTANTE: El hosting está bloqueando conexiones SMTP salientes.")
                    print("   Para resolver esto, contacta al administrador del hosting")
                    print("   para habilitar los puertos 587 y 465.")
                    print("=" * 60 + "\n")
                    
                    current_app.logger.error(f"❌ Hosting bloquea SMTP - CÓDIGO DE VERIFICACIÓN para {email}: {code_data['code']}")
                    current_app.logger.error("⚠️ FALLBACK ACTIVADO: Código disponible en logs del servidor")
                    
                    # Mostrar código al usuario como fallback temporal
                    # En producción, esto permite que el usuario continúe aunque el correo no se envíe
                    flash(
                        f"⚠️ No se pudo enviar el correo (el hosting bloquea conexiones SMTP). "
                        f"Código de verificación: {code_data['code']}. "
                        f"Por favor, contacta al administrador del hosting para habilitar puertos SMTP.",
                        "warning"
                    )
                    # Permitir continuar con el código (el usuario lo tiene ahora)
                    return render_template('auth/forgot_password.html', step='code', email=email)
                
                # Para otros errores (no de red)
                if current_app.config.get('DEBUG'):
                    current_app.logger.warning(f"⚠️ CÓDIGO DE VERIFICACIÓN (fallback modo debug): {code_data['code']}")
                    flash(f"⚠️ Error al enviar correo. Código de verificación (modo debug): {code_data['code']}", "warning")
                    return render_template('auth/forgot_password.html', step='code', email=email)
                
                flash("Error: No se pudo enviar el correo después de varios intentos. Por favor, contacta al administrador.", "danger")
                return render_template('auth/forgot_password.html', step='email')
            
        except Exception as e:
            error_msg = str(e)
            print(f"\n❌ ERROR INESPERADO AL ENVIAR CORREO:")
            print(f"   Tipo: {type(e).__name__}")
            print(f"   Mensaje: {error_msg}")
            print(f"   Código generado: {code_data['code']}")
            print("=" * 60 + "\n")
            current_app.logger.error(f"❌ Error inesperado enviando correo a {email}: {error_msg}")
            current_app.logger.error(f"Tipo de error: {type(e).__name__}")
            
            # En modo debug, mostrar el código en consola y logs
            if current_app.config.get('DEBUG'):
                current_app.logger.warning(f"⚠️ CÓDIGO DE VERIFICACIÓN (fallback modo debug): {code_data['code']}")
                # En modo debug, mostrar código pero con mensaje amigable
                flash(f"⚠️ Error al enviar correo. Código de verificación (modo debug): {code_data['code']}", "warning")
                return render_template('auth/forgot_password.html', step='code', email=email)
            
            # Mensaje de error simple y amigable
            flash("❌ Error al enviar el correo electrónico. Por favor, intenta más tarde o contacta al administrador.", "danger")
            
            return render_template('auth/forgot_password.html', step='email')

    return render_template('auth/forgot_password.html', step='email')


# =========================
# Restablecer contraseña
# =========================
@auth_bp.route('/reset_password', methods=['GET', 'POST'])
def reset_password():
    # Verificar que el código haya sido verificado
    if not session.get('reset_password_verified'):
        flash("Debes verificar el código primero.", "danger")
        return redirect(url_for('auth.forgot_password'))
    
    email = session.get('reset_password_email', '')
    code_hash = session.get('reset_password_code_hash', '')
    
    if not email:
        flash("Sesión expirada. Por favor, solicita un nuevo código.", "danger")
        session.pop('reset_password_email', None)
        session.pop('reset_password_verified', None)
        session.pop('reset_password_code_hash', None)
        return redirect(url_for('auth.forgot_password'))
    
    # Si es GET, solo mostrar el formulario (el cambio se hará desde el frontend)
    if request.method == 'GET':
        return render_template('auth/reset_password.html', valid=True, email=email)
    
    if request.method == 'POST':
        # Si viene como JSON, es desde el frontend
        if request.is_json:
            data = request.get_json()
            password = data.get('password', '').strip()
            password_confirm = data.get('password_confirm', '').strip()
        else:
            password_raw = request.form.get('password', '').strip()
            password_confirm_raw = request.form.get('password_confirm', '').strip()
            
            # Sanitizar contraseñas (no escapar HTML, solo eliminar caracteres de control)
            password = sanitize_string(password_raw, max_length=128, allow_html=False)
            password_confirm = sanitize_string(password_confirm_raw, max_length=128, allow_html=False)
            
            # Validar longitud mínima
            if len(password) < 6:
                flash('La contraseña debe tener al menos 6 caracteres.', 'danger')
                return render_template('auth/reset_password.html', valid=True, email=email)
            
            # Detectar intentos de XSS (aunque las contraseñas no se muestran, es buena práctica)
            if detect_xss_attempt(password_raw) or detect_xss_attempt(password_confirm_raw):
                log_security_event('xss_attempt', {'field': 'reset_password'})
                flash('Se detectó contenido no permitido. Por favor, intenta nuevamente.', 'danger')
                return render_template('auth/reset_password.html', valid=True, email=email)
        
        # Validar contraseñas
        if not password or len(password) < 6:
            if request.is_json:
                return jsonify({'success': False, 'message': 'La contraseña debe tener al menos 6 caracteres.'}), 400
            flash("La contraseña debe tener al menos 6 caracteres.", "danger")
            return render_template('auth/reset_password.html', valid=True, email=email)
        
        if password != password_confirm:
            if request.is_json:
                return jsonify({'success': False, 'message': 'Las contraseñas no coinciden.'}), 400
            flash("Las contraseñas no coinciden.", "danger")
            return render_template('auth/reset_password.html', valid=True, email=email)
        
        # Intentar actualizar la contraseña en Firebase Auth
        print("🔄 Intentando actualizar contraseña...")
        if update_user_password(email, password):
            print("✅ Contraseña actualizada exitosamente")
            
            # Marcar código como usado si está disponible
            if code_hash:
                mark_code_as_used(code_hash)
            
            # Limpiar sesión
            session.pop('reset_password_email', None)
            session.pop('reset_password_verified', None)
            session.pop('reset_password_code_hash', None)
            session.pop('reset_password_code', None)
            session.pop('reset_password_code_expires', None)
            
            print("✅ Sesión limpiada")
            print("=" * 60 + "\n")
            
            if request.is_json:
                return jsonify({
                    'success': True,
                    'message': 'Contraseña actualizada exitosamente.'
                })
            
            flash("Tu contraseña ha sido restablecida exitosamente. Ahora puedes iniciar sesión con tu nueva contraseña.", "success")
            return redirect(url_for('auth.login'))
        else:
            error_detail = "No se pudo actualizar la contraseña"
            print(f"❌ Error: {error_detail}")
            print("=" * 60 + "\n")
            
            if request.is_json:
                return jsonify({
                    'success': False,
                    'message': 'No se pudo actualizar la contraseña. Por favor, intenta nuevamente o contacta al administrador.'
                }), 400
            
            flash("❌ Error al restablecer la contraseña. El servicio necesita configuración adicional. Por favor, contacta al administrador.", "danger")
            return render_template('auth/reset_password.html', valid=True, email=email)
    
    # Mostrar formulario de restablecimiento
    return render_template('auth/reset_password.html', valid=True, email=email)
