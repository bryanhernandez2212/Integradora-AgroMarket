from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
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

