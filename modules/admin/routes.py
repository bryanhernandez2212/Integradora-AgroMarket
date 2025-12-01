from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_mail import Message
from modules.auth.decorators import login_required, role_required

admin_bp = Blueprint('admin', __name__, template_folder='templates')

# ===== Panel Administrador =====
@admin_bp.route("/panel")
@login_required
@role_required("administrador")
def panel_admin():
    """Panel principal del administrador"""
    return render_template(
        "admin/panel_admin.html",
        nombre=session.get("nombre"),
        correo=session.get("email"),
        usuario_id=session.get("usuario_id"),
        page='inicio'
    )

# ===== Gestión de Usuarios =====
@admin_bp.route("/usuarios")
@login_required
@role_required("administrador")
def gestion_usuarios():
    """Página para gestionar todos los usuarios"""
    return render_template(
        "admin/usuarios.html",
        nombre=session.get("nombre"),
        correo=session.get("email"),
        usuario_id=session.get("usuario_id"),
        page='usuarios'
    )

@admin_bp.route("/solicitudes-vendedores")
@login_required
@role_required("administrador")
def solicitudes_vendedores():
    """Página para revisar solicitudes de vendedores pendientes"""
    return render_template(
        "admin/solicitudes_vendedores.html",
        nombre=session.get("nombre"),
        correo=session.get("email"),
        usuario_id=session.get("usuario_id"),
        page='solicitudes'
    )

@admin_bp.route("/solicitudes-vendedores/<user_id>")
@login_required
@role_required("administrador")
def detalle_solicitud(user_id):
    """Página para ver los detalles de una solicitud específica"""
    return render_template(
        "admin/detalle_solicitud.html",
        nombre=session.get("nombre"),
        correo=session.get("email"),
        usuario_id=session.get("usuario_id"),
        page='solicitudes',
        solicitud_user_id=user_id
    )

# ===== API: Obtener todos los usuarios =====
@admin_bp.route("/api/usuarios", methods=["GET"])
@login_required
@role_required("administrador")
def api_obtener_usuarios():
    """API para obtener la lista de todos los usuarios"""
    try:
        # Esta función se implementará en el frontend con Firebase
        # Por ahora retornamos un JSON vacío
        return jsonify({
            "success": True,
            "usuarios": []
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ===== API: Actualizar usuario =====
@admin_bp.route("/api/usuarios/<user_id>", methods=["PUT", "PATCH"])
@login_required
@role_required("administrador")
def api_actualizar_usuario(user_id):
    """API para actualizar datos de un usuario"""
    try:
        data = request.get_json()
        # Esta función se implementará en el frontend con Firebase
        return jsonify({
            "success": True,
            "message": "Usuario actualizado correctamente"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ===== API: Eliminar usuario =====
@admin_bp.route("/api/usuarios/<user_id>", methods=["DELETE"])
@login_required
@role_required("administrador")
def api_eliminar_usuario(user_id):
    """API para eliminar un usuario"""
    try:
        # Esta función se implementará en el frontend con Firebase
        return jsonify({
            "success": True,
            "message": "Usuario eliminado correctamente"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ===== API: Cambiar rol de usuario =====
@admin_bp.route("/api/usuarios/<user_id>/rol", methods=["POST"])
@login_required
@role_required("administrador")
def api_cambiar_rol_usuario(user_id):
    """API para cambiar el rol de un usuario"""
    try:
        data = request.get_json()
        nuevo_rol = data.get("rol")
        # Esta función se implementará en el frontend con Firebase
        return jsonify({
            "success": True,
            "message": f"Rol actualizado a {nuevo_rol}"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ===== API: Enviar correo de aprobación de vendedor =====
@admin_bp.route("/api/enviar-correo-aprobacion", methods=["POST"])
@login_required
@role_required("administrador")
def api_enviar_correo_aprobacion():
    """API para enviar correo de aprobación de solicitud de vendedor usando SOLO Firebase Functions"""
    current_app.logger.info("")
    current_app.logger.info("=" * 80)
    current_app.logger.info("✅ ENDPOINT: /admin/api/enviar-correo-aprobacion")
    current_app.logger.info("🔧 MÉTODO DE ENVÍO: FIREBASE FUNCTIONS (único método disponible)")
    current_app.logger.info("=" * 80)
    
    try:
        data = request.get_json()
        if not data:
            current_app.logger.error('❌ No se recibieron datos JSON')
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
            
        email = data.get('email')
        nombre = data.get('nombre')
        nombre_tienda = data.get('nombre_tienda', '')
        ubicacion = data.get('ubicacion', '')
        
        current_app.logger.info(f'📧 Datos recibidos: email={email}, nombre={nombre}')
        
        if not email or not nombre:
            current_app.logger.warning(f'❌ Intento de enviar correo sin email o nombre')
            return jsonify({
                'success': False,
                'error': 'Email y nombre son requeridos'
            }), 400
        
        # Usar SOLO Firebase Functions (sin respaldo de Flask-Mail)
        try:
            from utils.firebase_functions import send_seller_approval_email_via_functions
        except ImportError:
            current_app.logger.error("❌ No se puede importar send_seller_approval_email_via_functions")
            return jsonify({
                'success': False,
                'error': 'Servicio de correo no disponible. Por favor, contacta al administrador.'
            }), 500
        
        try:
            success = send_seller_approval_email_via_functions(
                email=email,
                nombre=nombre,
                nombre_tienda=nombre_tienda,
                ubicacion=ubicacion
            )
            
            if success:
                current_app.logger.info("=" * 80)
                current_app.logger.info("✅ CORREO DE APROBACIÓN ENVIADO EXITOSAMENTE")
                current_app.logger.info(f"📧 Email: {email}")
                current_app.logger.info(f"🔧 MÉTODO: FIREBASE FUNCTIONS ✅")
                current_app.logger.info("=" * 80)
                
                return jsonify({
                    'success': True,
                    'message': 'Correo de aprobación enviado correctamente',
                    'method': 'firebase_functions',
                    'method_display': 'Firebase Functions',
                    'email': email
                })
            else:
                current_app.logger.error("❌ Firebase Functions falló al enviar correo de aprobación")
                return jsonify({
                    'success': False,
                    'error': 'No se pudo enviar el correo de aprobación. Por favor, contacta al administrador.'
                }), 500
        except Exception as e:
            current_app.logger.error(f"❌ Error con Firebase Functions: {str(e)}", exc_info=True)
            import traceback
            current_app.logger.error(f"   Traceback completo: {traceback.format_exc()}")
            return jsonify({
                'success': False,
                'error': f'Error al enviar correo: {str(e)}'
            }), 500
        
    except Exception as e:
        current_app.logger.error(f'❌ Error enviando correo de aprobación: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error al enviar correo: {str(e)}'
        }), 500

# ===== API: Enviar correo de rechazo de vendedor =====
@admin_bp.route("/api/enviar-correo-rechazo", methods=["POST"])
@login_required
@role_required("administrador")
def api_enviar_correo_rechazo():
    """API para enviar correo de rechazo de solicitud de vendedor usando SOLO Firebase Functions"""
    current_app.logger.info("")
    current_app.logger.info("=" * 80)
    current_app.logger.info("❌ ENDPOINT: /admin/api/enviar-correo-rechazo")
    current_app.logger.info("🔧 MÉTODO DE ENVÍO: FIREBASE FUNCTIONS (único método disponible)")
    current_app.logger.info("=" * 80)
    
    try:
        data = request.get_json()
        if not data:
            current_app.logger.error('❌ No se recibieron datos JSON')
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
            
        email = data.get('email')
        nombre = data.get('nombre')
        motivo_rechazo = data.get('motivo_rechazo', 'No se proporcionó un motivo específico.')
        
        current_app.logger.info(f'📧 Datos recibidos: email={email}, nombre={nombre}')
        current_app.logger.info(f'📝 Motivo: {motivo_rechazo}')
        
        if not email or not nombre:
            current_app.logger.warning(f'❌ Intento de enviar correo sin email o nombre')
            return jsonify({
                'success': False,
                'error': 'Email y nombre son requeridos'
            }), 400
        
        # Usar SOLO Firebase Functions (sin respaldo de Flask-Mail)
        try:
            from utils.firebase_functions import send_seller_rejection_email_via_functions
        except ImportError:
            current_app.logger.error("❌ No se puede importar send_seller_rejection_email_via_functions")
            return jsonify({
                'success': False,
                'error': 'Servicio de correo no disponible. Por favor, contacta al administrador.'
            }), 500
        
        try:
            success = send_seller_rejection_email_via_functions(
                email=email,
                nombre=nombre,
                motivo_rechazo=motivo_rechazo
            )
            
            if success:
                current_app.logger.info("=" * 80)
                current_app.logger.info("✅ CORREO DE RECHAZO ENVIADO EXITOSAMENTE")
                current_app.logger.info(f"📧 Email: {email}")
                current_app.logger.info(f"🔧 MÉTODO: FIREBASE FUNCTIONS ✅")
                current_app.logger.info("=" * 80)
                
                return jsonify({
                    'success': True,
                    'message': 'Correo de rechazo enviado correctamente',
                    'method': 'firebase_functions',
                    'method_display': 'Firebase Functions',
                    'email': email
                })
            else:
                current_app.logger.error("❌ Firebase Functions falló al enviar correo de rechazo")
                return jsonify({
                    'success': False,
                    'error': 'No se pudo enviar el correo de rechazo. Por favor, contacta al administrador.'
                }), 500
        except Exception as e:
            current_app.logger.error(f"❌ Error con Firebase Functions: {str(e)}", exc_info=True)
            import traceback
            current_app.logger.error(f"   Traceback completo: {traceback.format_exc()}")
            return jsonify({
                'success': False,
                'error': f'Error al enviar correo: {str(e)}'
            }), 500
        
    except Exception as e:
        current_app.logger.error(f'❌ Error enviando correo de rechazo: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error al enviar correo: {str(e)}'
        }), 500

# ===== API: Enviar correo a administradores sobre nueva solicitud de vendedor =====
@admin_bp.route("/api/enviar-correo-nueva-solicitud", methods=["POST"])
def api_enviar_correo_nueva_solicitud():
    """API para enviar correo a administradores cuando se crea una nueva solicitud de vendedor"""
    try:
        current_app.logger.info('📧 Recibida petición para enviar correo de nueva solicitud a administradores')
        
        data = request.get_json()
        if not data:
            current_app.logger.error('❌ No se recibieron datos JSON')
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
            
        solicitud_id = data.get('solicitud_id', '')
        nombre = data.get('nombre', '')
        email = data.get('email', '')
        nombre_tienda = data.get('nombre_tienda', '')
        ubicacion = data.get('ubicacion', '')
        fecha_solicitud = data.get('fecha_solicitud', '')
        
        current_app.logger.info(f'📧 Datos recibidos: solicitud_id={solicitud_id}, nombre={nombre}, email={email}')
        
        if not nombre or not email:
            current_app.logger.warning(f'❌ Intento de enviar correo sin nombre o email')
            return jsonify({
                'success': False,
                'error': 'Nombre y email son requeridos'
            }), 400
        
        # Obtener la instancia de Mail
        mail = current_app.extensions.get('mail')
        if not mail:
            return jsonify({
                'success': False,
                'error': 'Servicio de correo no disponible'
            }), 503
        
        # Email del administrador
        admin_email = 'agromarket559@gmail.com'
        
        # Crear el HTML del correo
        html_body = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ margin: 0; font-size: 28px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .section {{ background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                .section h2 {{ color: #4caf50; margin-top: 0; font-size: 20px; }}
                .alert-badge {{ background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; border-left: 4px solid #ffc107; }}
                .info-box {{ background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 15px 0; }}
                .info-box strong {{ color: #0066cc; }}
                .button {{ display: inline-block; background: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔔 Nueva Solicitud de Vendedor</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">AgroMarket</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <div class="alert-badge">
                            <h3 style="margin: 0; color: #856404;">⚠️ Requiere tu revisión</h3>
                        </div>
                        
                        <p>Se ha recibido una nueva solicitud para ser <strong>vendedor</strong> en AgroMarket que requiere tu revisión.</p>
                        
                        <div class="info-box">
                            <h3 style="margin-top: 0; color: #0066cc;">Información del solicitante:</h3>
                            <p><strong>Nombre:</strong> {nombre}</p>
                            <p><strong>Email:</strong> {email}</p>
                            <p><strong>Nombre de tienda:</strong> {nombre_tienda if nombre_tienda else 'No especificado'}</p>
                            <p><strong>Ubicación:</strong> {ubicacion if ubicacion else 'No especificada'}</p>
                            <p><strong>Fecha de solicitud:</strong> {fecha_solicitud if fecha_solicitud else 'No disponible'}</p>
                            <p><strong>ID de solicitud:</strong> {solicitud_id if solicitud_id else 'No disponible'}</p>
                        </div>
                        
                        <p>Por favor, revisa la solicitud en el panel de administración y decide si aprobarla o rechazarla.</p>
                        
                        <p style="text-align: center;">
                            <a href="/admin/solicitudes-vendedores" class="button">Revisar Solicitud</a>
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>© {data.get('year', '2024')} AgroMarket. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        
        # Crear y enviar el correo
        sender = current_app.config.get('MAIL_DEFAULT_SENDER', 'AgroMarket <agromarket559@gmail.com>')
        msg = Message(
            subject=f'🔔 Nueva Solicitud de Vendedor - {nombre}',
            recipients=[admin_email],
            sender=sender,
            html=html_body
        )
        
        mail.send(msg)
        current_app.logger.info(f"✅ Correo de nueva solicitud enviado a {admin_email}")
        
        return jsonify({
            'success': True,
            'message': 'Correo enviado correctamente a los administradores',
            'admin_email': admin_email
        })
        
    except Exception as e:
        current_app.logger.error(f'❌ Error enviando correo de nueva solicitud: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error al enviar correo: {str(e)}'
        }), 500

# ===== Mensajes de Soporte =====
@admin_bp.route("/mensajes-soporte")
@login_required
@role_required("administrador")
def mensajes_soporte():
    """Página para ver y gestionar mensajes de soporte"""
    return render_template(
        "admin/mensajes_soporte.html",
        nombre=session.get("nombre"),
        correo=session.get("email"),
        usuario_id=session.get("usuario_id"),
        page='soporte'
    )

