from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify, current_app
from flask_mail import Message
from modules.auth.decorators import login_required, role_required

admin_bp = Blueprint('admin', __name__, template_folder='templates')

# ===== Panel Administrador =====
@admin_bp.route("/panel")
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
    """API para enviar correo de aprobación de solicitud de vendedor"""
    try:
        data = request.get_json()
        email = data.get('email')
        nombre = data.get('nombre')
        nombre_tienda = data.get('nombre_tienda', '')
        ubicacion = data.get('ubicacion', '')
        
        if not email or not nombre:
            return jsonify({
                'success': False,
                'error': 'Email y nombre son requeridos'
            }), 400
        
        # Obtener la instancia de Mail
        mail = current_app.extensions.get('mail')
        if not mail:
            return jsonify({
                'success': False,
                'error': 'Servicio de correo no disponible'
            }), 503
        
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
                .success-badge {{ background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ ¡Solicitud Aprobada!</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">AgroMarket</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <h2>¡Felicidades {nombre}!</h2>
                        <p>Nos complace informarte que tu solicitud para ser <strong>vendedor</strong> en AgroMarket ha sido <strong>aprobada</strong>.</p>
                        
                        <div class="success-badge">
                            <h3 style="margin: 0; color: #155724;">✅ Tu solicitud ha sido aprobada</h3>
                        </div>
                        
                        <p>Ahora puedes acceder a tu panel de vendedor y comenzar a publicar tus productos.</p>
                        
                        <p><strong>Información de tu tienda:</strong></p>
                        <ul>
                            <li><strong>Nombre de la tienda:</strong> {nombre_tienda if nombre_tienda else 'No especificado'}</li>
                            <li><strong>Ubicación:</strong> {ubicacion if ubicacion else 'No especificada'}</li>
                        </ul>
                        
                        <p>Para acceder a tu panel de vendedor, simplemente inicia sesión en tu cuenta y serás redirigido automáticamente.</p>
                        
                        <p>¡Bienvenido a AgroMarket! Estamos emocionados de tenerte como parte de nuestra comunidad.</p>
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
        msg = Message(
            subject='✅ Solicitud de Vendedor Aprobada - AgroMarket',
            recipients=[email],
            html=html_body
        )
        
        mail.send(msg)
        current_app.logger.info(f"✅ Correo de aprobación enviado a {email}")
        
        return jsonify({
            'success': True,
            'message': 'Correo de aprobación enviado correctamente'
        })
        
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
    """API para enviar correo de rechazo de solicitud de vendedor"""
    try:
        data = request.get_json()
        email = data.get('email')
        nombre = data.get('nombre')
        motivo_rechazo = data.get('motivo_rechazo', 'No se proporcionó un motivo específico.')
        
        if not email or not nombre:
            return jsonify({
                'success': False,
                'error': 'Email y nombre son requeridos'
            }), 400
        
        # Obtener la instancia de Mail
        mail = current_app.extensions.get('mail')
        if not mail:
            return jsonify({
                'success': False,
                'error': 'Servicio de correo no disponible'
            }), 503
        
        # Crear el HTML del correo
        html_body = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #f44336 0%, #da190b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ margin: 0; font-size: 28px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .section {{ background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                .section h2 {{ color: #f44336; margin-top: 0; font-size: 20px; }}
                .warning-box {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚠️ Solicitud Revisada</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">AgroMarket</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <h2>Hola {nombre}</h2>
                        <p>Lamentamos informarte que tu solicitud para ser <strong>vendedor</strong> en AgroMarket no ha sido aprobada en esta ocasión.</p>
                        
                        <div class="warning-box">
                            <h3 style="margin: 0 0 10px 0; color: #856404;">Motivo del rechazo:</h3>
                            <p style="margin: 0; color: #856404;">{motivo_rechazo}</p>
                        </div>
                        
                        <p>Si deseas volver a intentar, puedes crear una nueva solicitud desde tu perfil en cualquier momento.</p>
                        
                        <p>Si tienes preguntas o necesitas más información, no dudes en contactarnos.</p>
                        
                        <p>Gracias por tu interés en formar parte de AgroMarket.</p>
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
        msg = Message(
            subject='⚠️ Solicitud de Vendedor Rechazada - AgroMarket',
            recipients=[email],
            html=html_body
        )
        
        mail.send(msg)
        current_app.logger.info(f"✅ Correo de rechazo enviado a {email}")
        
        return jsonify({
            'success': True,
            'message': 'Correo de rechazo enviado correctamente'
        })
        
    except Exception as e:
        current_app.logger.error(f'❌ Error enviando correo de rechazo: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error al enviar correo: {str(e)}'
        }), 500

