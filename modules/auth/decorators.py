from functools import wraps
from flask import session, redirect, url_for, flash

def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        from flask import request, jsonify
        
        if "usuario_id" not in session:
            # Si es una petición JSON, devolver JSON error
            if request.is_json or request.content_type == 'application/json':
                return jsonify({'error': 'Debes iniciar sesión para acceder a esta página.'}), 401
            flash("Debes iniciar sesión para acceder a esta página.", "danger")
            return redirect(url_for("auth.login"))
        return f(*args, **kwargs)
    return wrapped

def role_required(rol):
    """
    Decorator que protege la ruta según el rol.
    Ej: @role_required("vendedor")
    Funciona con múltiples roles por usuario (lista en session['roles']).
    Para peticiones JSON/AJAX, devuelve JSON en lugar de redirigir.
    """
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            from flask import request, jsonify
            
            if "usuario_id" not in session:
                # Si es una petición JSON, devolver JSON error
                if request.is_json or request.content_type == 'application/json':
                    return jsonify({'error': 'Debes iniciar sesión para acceder a esta página.'}), 401
                flash("Debes iniciar sesión para acceder a esta página.", "danger")
                return redirect(url_for("auth.login"))

            # roles del usuario: puede ser string o lista
            roles_usuario = session.get("roles", [])
            if isinstance(roles_usuario, str):
                roles_usuario = [roles_usuario]
            
            # Obtener rol activo también
            rol_activo = session.get("rol_activo", "").lower() if session.get("rol_activo") else ""
            
            # Verifica si el rol requerido está en la lista de roles O es el rol activo
            rol_requerido_lower = rol.lower()
            tiene_rol = (
                rol_requerido_lower in [r.lower() for r in roles_usuario] or
                rol_activo == rol_requerido_lower
            )
            
            # Para administradores, también verificar que el rol_activo sea administrador
            if rol_requerido_lower == "administrador":
                if rol_activo != "administrador":
                    tiene_rol = False
            
            if not tiene_rol:
                # Si es una petición JSON, devolver JSON error
                if request.is_json or request.content_type == 'application/json':
                    return jsonify({
                        'error': 'No tienes permisos para acceder a esta página.',
                        'required_role': rol,
                        'user_roles': roles_usuario,
                        'rol_activo': rol_activo
                    }), 403
                flash("No tienes permisos para acceder a esta página.", "danger")
                return redirect(url_for("auth.login"))

            return f(*args, **kwargs)
        return wrapped
    return decorator
