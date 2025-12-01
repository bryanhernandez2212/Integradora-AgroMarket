# Rutas generales de AgroMarket

from flask import Blueprint, render_template, jsonify, request, current_app, send_from_directory, abort
from flask_mail import Message
import sys
import os

# Agregar el directorio raíz al path para importar utils
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.security import (
    sanitize_string, sanitize_email, sanitize_text_area,
    sanitize_form_data, detect_xss_attempt, log_security_event
)

# Blueprint para rutas generales
general_bp = Blueprint("general", __name__)

@general_bp.route("/")
def home():
    """Página principal"""
    return render_template("general/informacion.html")

@general_bp.route("/informacion")
def informacion():
    """Página de información"""
    return render_template("general/informacion.html")

@general_bp.route("/catalogo_offline")
def catalogo_offline():
    """Catálogo offline"""
    return render_template("general/catalogo_offline.html")

@general_bp.route("/sobre_nosotros")
def sobre_nosotros():
    """Página sobre nosotros"""
    return render_template("general/sobre_nosotros.html")

@general_bp.route("/aviso_privacidad")
def aviso_privacidad():
    """Página de aviso de privacidad"""
    return render_template("general/aviso_privacidad.html")

@general_bp.route("/soporte")
def soporte():
    """Página de soporte"""
    return render_template("general/soporte.html")

@general_bp.route("/descargar-apk")
def descargar_apk():
    """Descargar el archivo APK de la aplicación"""
    try:
        # Obtener la ruta base del proyecto
        # current_app.root_path apunta al directorio de templates, necesitamos subir un nivel
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        # Ruta del archivo APK
        apk_path = os.path.join(base_dir, 'general', 'app-release.apk')
        apk_path = os.path.abspath(apk_path)
        
        # Verificar que el archivo existe
        if not os.path.exists(apk_path):
            current_app.logger.error(f"Archivo APK no encontrado en: {apk_path}")
            abort(404, description="Archivo APK no encontrado. Por favor, contacta al administrador.")
        
        # Obtener el directorio y el nombre del archivo
        apk_dir = os.path.dirname(apk_path)
        apk_filename = os.path.basename(apk_path)
        
        current_app.logger.info(f"Sirviendo APK: {apk_filename} desde {apk_dir}")
        
        # Enviar el archivo
        return send_from_directory(
            apk_dir,
            apk_filename,
            as_attachment=True,
            download_name='AgroMarket.apk',
            mimetype='application/vnd.android.package-archive'
        )
    except Exception as e:
        current_app.logger.error(f"Error al descargar APK: {str(e)}", exc_info=True)
        abort(500, description="Error al descargar el archivo APK")

@general_bp.route("/api/noticias")
def api_noticias():
    """API para obtener noticias"""
    # Nota: Las noticias ahora se obtienen de Firebase en el frontend
    return jsonify({"noticias": []})

@general_bp.route("/api/enviar-soporte", methods=["POST"])
def enviar_soporte():
    """Endpoint para enviar mensajes de soporte por correo"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "error": "No se recibieron datos"}), 400
        
        # Esquema de validación y sanitización
        schema = {
            'nombre': {
                'type': 'name',
                'required': True,
                'min_length': 2,
                'max_length': 100
            },
            'email': {
                'type': 'email',
                'required': True
            },
            'asunto': {
                'type': 'string',
                'required': True,
                'max_length': 50
            },
            'mensaje': {
                'type': 'textarea',
                'required': True,
                'max_length': 5000
            }
        }
        
        # Sanitizar y validar datos
        try:
            sanitized_data = sanitize_form_data(data, schema)
        except ValueError as e:
            log_security_event('invalid_input', {'error': str(e), 'data': data})
            return jsonify({"success": False, "error": str(e)}), 400
        
        # Detectar intentos de XSS
        for field, value in sanitized_data.items():
            if isinstance(value, str) and detect_xss_attempt(value):
                log_security_event('xss_attempt', {'field': field, 'value': value[:100]})
                return jsonify({
                    "success": False,
                    "error": "Se detectó contenido no permitido en el formulario"
                }), 400
        
        nombre = sanitized_data.get('nombre')
        email = sanitized_data.get('email')
        asunto = sanitized_data.get('asunto')
        mensaje = sanitized_data.get('mensaje')
        
        # Validar campos requeridos (después de sanitización)
        if not nombre or not email or not asunto or not mensaje:
            return jsonify({"success": False, "error": "Todos los campos son requeridos"}), 400
        
        # Mapear asuntos a texto legible
        asuntos_map = {
            "cuenta": "Problemas con mi cuenta",
            "pedido": "Consulta sobre un pedido",
            "pago": "Problemas con el pago",
            "producto": "Consulta sobre productos",
            "tecnico": "Soporte técnico",
            "otro": "Otro"
        }
        asunto_texto = asuntos_map.get(asunto, asunto)
        
        # Obtener Flask-Mail desde la app
        mail = current_app.extensions.get('mail')
        
        if not mail:
            current_app.logger.error("Flask-Mail no está configurado")
            return jsonify({"success": False, "error": "Error de configuración del servidor"}), 500
        
        # Crear el mensaje de correo
        html_body = f'''
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
                .section {{ background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                .section h2 {{ color: #2e8b57; margin-top: 0; font-size: 20px; border-bottom: 2px solid #2e8b57; padding-bottom: 10px; }}
                .info-row {{ padding: 10px 0; border-bottom: 1px solid #eee; }}
                .info-label {{ font-weight: bold; color: #2e8b57; }}
                .message-box {{ background: #e8f5e9; padding: 15px; border-radius: 8px; margin-top: 15px; white-space: pre-wrap; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🍃 AgroMarket</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">Nuevo Mensaje de Soporte</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <h2>📋 Información del Contacto</h2>
                        <div class="info-row">
                            <span class="info-label">Nombre:</span> {nombre}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Correo electrónico:</span> {email}
                        </div>
                        <div class="info-row">
                            <span class="info-label">Asunto:</span> {asunto_texto}
                        </div>
                    </div>
                    
                    <div class="section">
                        <h2>💬 Mensaje</h2>
                        <div class="message-box">{mensaje}</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Este mensaje fue enviado desde el formulario de soporte de AgroMarket</p>
                    <p>© 2025 AgroMarket. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        
        # Crear y enviar el mensaje
        msg = Message(
            subject=f"Soporte AgroMarket: {asunto_texto}",
            recipients=["agromarket559@gmail.com"],
            html=html_body,
            reply_to=email
        )
        
        mail.send(msg)
        
        current_app.logger.info(f"Mensaje de soporte enviado desde {email} - Asunto: {asunto_texto}")
        
        return jsonify({
            "success": True,
            "message": "Tu mensaje ha sido enviado correctamente. Te responderemos pronto.",
            "data": {
                "nombre": nombre,
                "email": email,
                "asunto": asunto,
                "asunto_texto": asunto_texto,
                "mensaje": mensaje
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"Error al enviar mensaje de soporte: {str(e)}")
        return jsonify({
            "success": False,
            "error": "Error al enviar el mensaje. Por favor, intenta nuevamente más tarde."
        }), 500