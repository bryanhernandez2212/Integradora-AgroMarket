from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_mail import Message, Mail
from functools import wraps
from datetime import datetime, timedelta
import secrets
import hashlib
import os

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
        
        # Por ahora, aceptamos la petición sin validar el token (en producción deberías validar el token de Firebase)
        user_id = data.get('user_id')
        roles = data.get('roles', [])
        rol_activo = data.get('rol_activo', 'comprador')
        nombre = data.get('nombre', 'Usuario')
        email = data.get('email', '')
        
        if not user_id:
            return jsonify({'error': 'user_id es requerido'}), 400
        
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
        
        # Calcular directorio base
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        print(f"📁 Directorio base: {base_dir}")
        
        # Buscar archivo de credenciales en varios lugares
        possible_paths = [
            # Variable de entorno
            os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'),
            # Archivo en el directorio raíz del proyecto
            os.path.join(base_dir, 'serviceAccountKey.json'),
            # Archivo alternativo
            os.path.join(base_dir, 'firebase-service-account.json'),
            # Archivo en config/
            os.path.join(base_dir, 'config', 'serviceAccountKey.json'),
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
            app = firebase_admin.initialize_app(cred)
            print("✅ Firebase Admin SDK inicializado correctamente")
            current_app.logger.info("✅ Firebase Admin SDK inicializado correctamente")
            return app
        else:
            print("⚠️ No se encontró archivo de credenciales en ninguna ubicación")
            # Intentar usar credenciales por defecto (si están en el sistema)
            try:
                app = firebase_admin.initialize_app()
                print("✅ Firebase Admin SDK inicializado con credenciales por defecto")
                current_app.logger.info("✅ Firebase Admin SDK inicializado con credenciales por defecto")
                return app
            except Exception as default_error:
                # Si no hay credenciales, retornar None
                print(f"❌ Error inicializando con credenciales por defecto: {str(default_error)}")
                current_app.logger.warning("⚠️ Firebase Admin no está configurado. Coloca el archivo 'serviceAccountKey.json' en la raíz del proyecto.")
                current_app.logger.warning(f"   Error: {str(default_error)}")
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
    """Obtiene un usuario de Firebase Auth por email"""
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
        current_app.logger.error(f"Error obteniendo usuario: {str(e)}")
        return None

def update_user_password_via_rest_api(email, new_password):
    """Actualiza la contraseña usando Firebase REST API (sin Admin SDK)
    
    Nota: Este método requiere que el usuario haya recibido un OOB code por email.
    Sin Firebase Admin SDK, no podemos cambiar la contraseña directamente.
    """
    # Sin Firebase Admin SDK, no podemos cambiar la contraseña directamente
    # porque necesitamos un OOB code que solo viene en el email del usuario
    current_app.logger.warning("update_user_password_via_rest_api: No se puede cambiar contraseña sin OOB code")
    print("⚠️ No se puede cambiar contraseña sin OOB code (requiere Admin SDK o email del usuario)")
    return False

def update_user_password(email, new_password):
    """Actualiza la contraseña de un usuario en Firebase Auth"""
    try:
        print(f"\n🔐 Intentando actualizar contraseña para {email[:3]}***")
        
        # Intentar primero con Firebase Admin SDK si está disponible
        app = initialize_firebase_admin()
        if app:
            print("✅ Firebase Admin SDK inicializado")
            
            # Obtener usuario por email
            print(f"🔍 Buscando usuario por email: {email}")
            user = get_user_by_email(email)
            if user:
                print(f"✅ Usuario encontrado: {user.uid}")
                
                # Actualizar contraseña
                print("🔄 Actualizando contraseña en Firebase Auth...")
                firebase_auth.update_user(user.uid, password=new_password)
                print("✅ Contraseña actualizada exitosamente con Admin SDK")
                return True
            else:
                print("⚠️ Usuario no encontrado con Admin SDK, intentando REST API...")
        
        # Si Admin SDK no está disponible o no encontró usuario, usar REST API
        print("🔄 Usando Firebase REST API como alternativa...")
        return update_user_password_via_rest_api(email, new_password)
        
    except Exception as e:
        error_msg = f"Error actualizando contraseña: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"   Tipo: {type(e).__name__}")
        current_app.logger.error(error_msg)
        current_app.logger.error(f"Tipo de error: {type(e).__name__}")
        
        # Como último recurso, intentar REST API
        print("🔄 Intentando como último recurso con REST API...")
        return update_user_password_via_rest_api(email, new_password)

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
        
        # Verificar si el usuario existe en Firebase Auth
        current_app.logger.info("🔍 Verificando si el usuario existe en Firebase Auth...")
        user = get_user_by_email(email)
        if not user:
            current_app.logger.warning(f"⚠️ Usuario no encontrado para {email} (o Firebase Admin no configurado)")
            # Por seguridad, siempre mostrar el mismo mensaje aunque el usuario no exista
            # Continuar para enviar el correo (en modo debug permite continuar)
            if not current_app.config.get('DEBUG'):
                # En producción, mostrar mensaje pero no enviar correo si no hay usuario
                flash("Si el correo existe en nuestro sistema, recibirás un código de verificación.", "info")
                return render_template('auth/forgot_password.html', step='email')
        
        # Generar código de recuperación
        current_app.logger.info("🔑 Generando código de recuperación...")
        code_data = generate_reset_code(email)
        current_app.logger.info(f"✅ Código generado: {code_data['code']}")
        
        # Guardar código en Firestore (opcional si no hay Firebase Admin)
        current_app.logger.info("💾 Guardando código en Firestore...")
        firestore_saved = save_reset_code_to_firestore(code_data)
        
        # SIEMPRE guardar en sesión como respaldo (tanto en DEBUG como en producción)
        # Esto asegura que funcione incluso si Firestore falla
        session['reset_password_code'] = code_data['code']
        session['reset_password_code_expires'] = code_data['expires_at'].isoformat()
        session['reset_password_code_hash'] = code_data['code_hash']
        current_app.logger.info(f"✅ Código guardado en sesión: {code_data['code']}")
        
        if not firestore_saved:
            current_app.logger.warning("⚠️ No se pudo guardar en Firestore (Firebase Admin no configurado o error)")
            current_app.logger.info("✅ Usando sesión como respaldo")
        else:
            current_app.logger.info("✅ Código guardado en Firestore y en sesión")
        
        # Guardar email en sesión para la siguiente etapa
        session['reset_password_email'] = email
        current_app.logger.info(f"💾 Email guardado en sesión: {email[:3]}***")
        
        # Enviar correo con Flask-Mail
        print("\n" + "=" * 60)
        print("📧 INICIANDO ENVÍO DE CORREO")
        print("=" * 60)
        
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
            
            # Crear mensaje de correo
            msg = Message(
                subject='🔐 Código de Verificación - AgroMarket',
                recipients=[email],
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
            mail.send(msg)
            print("✅ ¡Correo enviado exitosamente!")
            print("=" * 60 + "\n")
            current_app.logger.info(f"✅ Correo enviado exitosamente a {email}")
            flash("✅ Correo enviado exitosamente. Por favor, revisa tu bandeja de entrada e ingresa el código de verificación.", "success")
            return render_template('auth/forgot_password.html', step='code', email=email)
            
        except Exception as e:
            error_msg = str(e)
            print(f"\n❌ ERROR AL ENVIAR CORREO:")
            print(f"   Tipo: {type(e).__name__}")
            print(f"   Mensaje: {error_msg}")
            print(f"   Código generado: {code_data['code']}")
            print("=" * 60 + "\n")
            current_app.logger.error(f"❌ Error enviando correo a {email}: {error_msg}")
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
            password = request.form.get('password', '').strip()
            password_confirm = request.form.get('password_confirm', '').strip()
        
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
