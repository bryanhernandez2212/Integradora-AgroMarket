# Aplicación principal de AgroMarket
# Usa Firebase Firestore como base de datos

import os
from flask import Flask, render_template
from flask_mail import Mail
from config.app import config

# Importar blueprints de módulos
from modules.auth.routes import auth_bp
from modules.comprador.routes import comprador
from modules.vendedor.routes import vendedor_bp
from modules.general.routes import general_bp
from modules.vendors import vendors_bp
from modules.admin.routes import admin_bp

# Inicializar Flask-Mail
mail = Mail()

def create_app(config_name='development'):
    """Factory para crear la aplicación Flask"""
    app = Flask(__name__)
    
    # Detectar si estamos en producción (Railway, Heroku, Render, etc.)
    # Railway usa la variable de entorno RAILWAY_ENVIRONMENT
    # Heroku usa DYNO
    # Render usa RENDER
    # Otros hostings pueden usar FLASK_ENV=production o PRODUCTION=true
    production_indicators = [
        os.environ.get('RAILWAY_ENVIRONMENT'),
        os.environ.get('DYNO'),  # Heroku
        os.environ.get('RENDER'),  # Render
        os.environ.get('PRODUCTION', '').lower() == 'true',
        os.environ.get('FLASK_ENV', '').lower() == 'production',
    ]
    
    if any(production_indicators):
        config_name = 'production'
        print("🔧 Modo PRODUCCIÓN detectado")
    
    # Configuración
    app.config.from_object(config[config_name])
    
    # Configurar sesiones permanentes
    @app.before_request
    def make_session_permanent():
        from flask import session
        session.permanent = True
    
    # Inicializar Flask-Mail
    mail.init_app(app)
    
    # Validar configuración de correo en producción
    if config_name == 'production':
        mail_config = {
            'MAIL_SERVER': app.config.get('MAIL_SERVER'),
            'MAIL_USERNAME': app.config.get('MAIL_USERNAME'),
            'MAIL_PASSWORD': 'Configurada' if app.config.get('MAIL_PASSWORD') else 'NO CONFIGURADA'
        }
        print("📧 Configuración de correo en producción:")
        print(f"   Servidor: {mail_config['MAIL_SERVER']}")
        print(f"   Usuario: {mail_config['MAIL_USERNAME']}")
        print(f"   Contraseña: {mail_config['MAIL_PASSWORD']}")
        
        if not app.config.get('MAIL_USERNAME') or not app.config.get('MAIL_PASSWORD'):
            print("⚠️ ADVERTENCIA: Variables de entorno de correo no configuradas correctamente")
            print("   Configura MAIL_USERNAME y MAIL_PASSWORD en las variables de entorno del hosting")
    
    # Registrar blueprints
    app.register_blueprint(general_bp)
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(vendedor_bp, url_prefix="/vendedor")
    app.register_blueprint(comprador, url_prefix="/comprador")
    app.register_blueprint(vendors_bp, url_prefix="/vendors")
    app.register_blueprint(admin_bp, url_prefix="/admin")
    
    # Ruta adicional para registro sin prefijo
    @app.route("/register", methods=["GET", "POST"])
    def register():
        """Página de registro - Firebase maneja el registro en el frontend"""
        return render_template("auth/register.html")
    
    # Ruta para manejar errores 404
    @app.errorhandler(404)
    def not_found(error):
        return render_template("general/informacion.html"), 404
    
    return app

# Crear la aplicación
app = create_app()

# ---------------------------
# EJECUTAR LA APP
# ---------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)