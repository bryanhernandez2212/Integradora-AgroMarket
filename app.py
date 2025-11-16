# Aplicación principal de AgroMarket
# Usa Firebase Firestore como base de datos

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
    
    # Configuración
    app.config.from_object(config[config_name])
    
    # Inicializar Flask-Mail
    mail.init_app(app)
    
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
    import os
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)