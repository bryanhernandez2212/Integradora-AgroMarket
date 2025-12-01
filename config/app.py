# Configuración general de la aplicación

import os

class Config:
    """Configuración base de la aplicación"""
    SECRET_KEY = "clave_secreta_agromarket"
    
    # Configuración de desarrollo
    DEBUG = True
    TESTING = False
    
    # Configuración del servidor
    HOST = "127.0.0.1"
    PORT = 5000
    
    # Configuración de sesiones
    SESSION_COOKIE_SECURE = False  # En desarrollo, False. En producción con HTTPS, True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 86400  # 24 horas
    
    # Configuración de Stripe
    STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY') or 'pk_test_51S4nWTKFtQrWkPCD3FRrULpKifZ43LK9m3RcNn9TFpbzYqNU36uInxGyKRuuV78HtuC5drNe0qeZWei34yKGiYeF00M9L6swJq'
    STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY') or 'sk_test_51S4nWTKFtQrWkPCDrCpPfYlsfL8ypkkhPfUlhMucmh1tS1afbn5QBZG4kNPI3bAyZpp8hKMS9rzRPkWGN06i0uwB00FEGEsbBX'
    STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET') or 'whsec_your_webhook_secret_here'
    STRIPE_ONBOARDING_RETURN_URL = os.environ.get('STRIPE_ONBOARDING_RETURN_URL') or 'http://localhost:5001/vendedor/panel'
    STRIPE_ONBOARDING_REFRESH_URL = os.environ.get('STRIPE_ONBOARDING_REFRESH_URL') or 'http://localhost:5001/vendedor/panel'
    
    # Configuración de Flask-Mail
    MAIL_SERVER = os.environ.get('MAIL_SERVER') or 'smtp.gmail.com'
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 587)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ['true', 'on', '1']
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME') or 'agromarket559@gmail.com'  # ⬅️ Reemplaza con tu email de Gmail
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD') or 'xnzf mxvp vjbi iioj'  # Contraseña de aplicación de Gmail
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or 'AgroMarket <agromarket559@gmail.com>'  # ⬅️ Reemplaza con tu email

    # Firebase Admin / Firestore
    FIREBASE_CREDENTIALS_PATH = os.environ.get('FIREBASE_CREDENTIALS_PATH')
    FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID') or 'agromarket-625b2'
    

class DevelopmentConfig(Config):
    """Configuración para desarrollo"""
    DEBUG = True

class ProductionConfig(Config):
    """Configuración para producción"""
    DEBUG = False
    
    # En producción, usar variables de entorno
    SECRET_KEY = os.environ.get('SECRET_KEY') or "clave_super_secreta_produccion"
    HOST = os.environ.get('HOST') or '0.0.0.0'
    PORT = int(os.environ.get('PORT') or 5000)
    
    # Configuración de sesiones para producción (HTTPS)
    SESSION_COOKIE_SECURE = True  # Requiere HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 86400  # 24 horas
    
    # Configuración de Flask-Mail para producción
    # Usar variables de entorno si están disponibles, sino usar valores por defecto (igual que en desarrollo)
    MAIL_SERVER = os.environ.get('MAIL_SERVER') or 'smtp.gmail.com'
    MAIL_PORT = int(os.environ.get('MAIL_PORT') or 587)
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() in ['true', 'on', '1']
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME') or 'agromarket559@gmail.com'  # Mismo valor que en desarrollo
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD') or 'xnzf mxvp vjbi iioj'  # Mismo valor que en desarrollo
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or 'AgroMarket <agromarket559@gmail.com>'

# Configuración por defecto
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
