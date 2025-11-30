"""
Módulo de seguridad para sanitización y validación de inputs
Protege contra XSS, inyección de código y otros ataques
"""

import re
import html
from typing import Optional, Dict, Any
from flask import current_app


def sanitize_string(text: str, max_length: Optional[int] = None, allow_html: bool = False) -> str:
    """
    Sanitiza un string eliminando caracteres peligrosos y escapando HTML
    
    Args:
        text: String a sanitizar
        max_length: Longitud máxima permitida
        allow_html: Si es True, permite HTML seguro (usar con precaución)
    
    Returns:
        String sanitizado
    """
    if not isinstance(text, str):
        text = str(text)
    
    # Eliminar caracteres nulos y de control
    text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
    
    # Limitar longitud
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    # Escapar HTML si no se permite
    if not allow_html:
        text = html.escape(text)
    
    # Eliminar espacios al inicio y final
    text = text.strip()
    
    return text


def sanitize_email(email: str) -> Optional[str]:
    """
    Valida y sanitiza un email
    
    Args:
        email: Email a validar
    
    Returns:
        Email sanitizado o None si es inválido
    """
    if not email or not isinstance(email, str):
        return None
    
    email = email.strip().lower()
    
    # Patrón básico de email
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    if not re.match(email_pattern, email):
        return None
    
    # Longitud máxima
    if len(email) > 254:
        return None
    
    return email


def sanitize_url(url: str) -> Optional[str]:
    """
    Valida y sanitiza una URL
    
    Args:
        url: URL a validar
    
    Returns:
        URL sanitizada o None si es inválida
    """
    if not url or not isinstance(url, str):
        return None
    
    url = url.strip()
    
    # Verificar que comience con http:// o https://
    if not url.startswith(('http://', 'https://')):
        return None
    
    # Longitud máxima
    if len(url) > 2048:
        return None
    
    return url


def sanitize_filename(filename: str) -> str:
    """
    Sanitiza un nombre de archivo eliminando caracteres peligrosos
    
    Args:
        filename: Nombre de archivo a sanitizar
    
    Returns:
        Nombre de archivo sanitizado
    """
    if not filename or not isinstance(filename, str):
        return "file"
    
    # Eliminar caracteres peligrosos
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '', filename)
    
    # Limitar longitud
    if len(filename) > 255:
        name, ext = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        filename = name[:255-len(ext)-1] + ('.' + ext if ext else '')
    
    return filename or "file"


def validate_name(name: str, min_length: int = 2, max_length: int = 100) -> Optional[str]:
    """
    Valida un nombre (solo letras, espacios, guiones y apóstrofes)
    
    Args:
        name: Nombre a validar
        min_length: Longitud mínima
        max_length: Longitud máxima
    
    Returns:
        Nombre validado o None si es inválido
    """
    if not name or not isinstance(name, str):
        return None
    
    name = name.strip()
    
    # Verificar longitud
    if len(name) < min_length or len(name) > max_length:
        return None
    
    # Solo letras, espacios, guiones, apóstrofes y acentos
    if not re.match(r'^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-\']+$', name):
        return None
    
    return name


def validate_phone(phone: str) -> Optional[str]:
    """
    Valida un número de teléfono (solo dígitos)
    
    Args:
        phone: Teléfono a validar
    
    Returns:
        Teléfono validado o None si es inválido
    """
    if not phone or not isinstance(phone, str):
        return None
    
    # Eliminar espacios, guiones y paréntesis
    phone = re.sub(r'[\s\-\(\)]', '', phone)
    
    # Solo dígitos
    if not phone.isdigit():
        return None
    
    # Longitud típica (10 dígitos para México)
    if len(phone) < 10 or len(phone) > 15:
        return None
    
    return phone


def sanitize_text_area(text: str, max_length: Optional[int] = 5000) -> str:
    """
    Sanitiza un área de texto (mensajes, descripciones, etc.)
    
    Args:
        text: Texto a sanitizar
        max_length: Longitud máxima
    
    Returns:
        Texto sanitizado
    """
    if not isinstance(text, str):
        text = str(text)
    
    # Eliminar caracteres de control excepto saltos de línea y tabs
    text = re.sub(r'[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]', '', text)
    
    # Limitar longitud
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    # Escapar HTML
    text = html.escape(text)
    
    # Normalizar saltos de línea
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\r', '\n', text)
    
    return text.strip()


def sanitize_price(price: Any) -> Optional[float]:
    """
    Valida y sanitiza un precio
    
    Args:
        price: Precio a validar (puede ser string o número)
    
    Returns:
        Precio como float o None si es inválido
    """
    try:
        if isinstance(price, str):
            # Eliminar caracteres no numéricos excepto punto y coma
            price = re.sub(r'[^\d.]', '', price)
            if not price:
                return None
            price = float(price)
        else:
            price = float(price)
        
        # Verificar que sea positivo y razonable
        if price < 0 or price > 1000000:
            return None
        
        # Redondear a 2 decimales
        return round(price, 2)
    except (ValueError, TypeError):
        return None


def sanitize_integer(value: Any, min_value: Optional[int] = None, max_value: Optional[int] = None) -> Optional[int]:
    """
    Valida y sanitiza un entero
    
    Args:
        value: Valor a validar
        min_value: Valor mínimo permitido
        max_value: Valor máximo permitido
    
    Returns:
        Entero validado o None si es inválido
    """
    try:
        if isinstance(value, str):
            # Solo dígitos
            if not value.isdigit():
                return None
            value = int(value)
        else:
            value = int(value)
        
        if min_value is not None and value < min_value:
            return None
        if max_value is not None and value > max_value:
            return None
        
        return value
    except (ValueError, TypeError):
        return None


def sanitize_form_data(data: Dict[str, Any], schema: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Sanitiza un diccionario de datos de formulario según un esquema
    
    Args:
        data: Datos del formulario
        schema: Esquema de validación con formato:
            {
                'campo': {
                    'type': 'string|email|int|float|phone|name|textarea',
                    'required': True/False,
                    'max_length': int,
                    'min_length': int,
                    'default': valor
                }
            }
    
    Returns:
        Diccionario con datos sanitizados
    """
    sanitized = {}
    
    for field, rules in schema.items():
        value = data.get(field)
        
        # Si es requerido y no está presente
        if rules.get('required', False) and (value is None or value == ''):
            raise ValueError(f"El campo '{field}' es requerido")
        
        # Si no está presente y tiene default
        if (value is None or value == '') and 'default' in rules:
            value = rules['default']
        
        # Si no está presente, continuar
        if value is None or value == '':
            continue
        
        # Sanitizar según el tipo
        field_type = rules.get('type', 'string')
        
        if field_type == 'email':
            sanitized_value = sanitize_email(value)
        elif field_type == 'int':
            sanitized_value = sanitize_integer(
                value,
                rules.get('min_value'),
                rules.get('max_value')
            )
        elif field_type == 'float':
            sanitized_value = sanitize_price(value)
        elif field_type == 'phone':
            sanitized_value = validate_phone(value)
        elif field_type == 'name':
            sanitized_value = validate_name(
                value,
                rules.get('min_length', 2),
                rules.get('max_length', 100)
            )
        elif field_type == 'textarea':
            sanitized_value = sanitize_text_area(value, rules.get('max_length', 5000))
        else:  # string por defecto
            sanitized_value = sanitize_string(
                value,
                rules.get('max_length'),
                rules.get('allow_html', False)
            )
        
        # Si la sanitización falló y es requerido, lanzar error
        if sanitized_value is None and rules.get('required', False):
            raise ValueError(f"El campo '{field}' tiene un valor inválido")
        
        # Si la sanitización falló pero no es requerido, usar default o None
        if sanitized_value is None:
            sanitized_value = rules.get('default')
        
        if sanitized_value is not None:
            sanitized[field] = sanitized_value
    
    return sanitized


def detect_xss_attempt(text: str) -> bool:
    """
    Detecta intentos básicos de XSS
    
    Args:
        text: Texto a analizar
    
    Returns:
        True si se detecta un intento de XSS
    """
    if not isinstance(text, str):
        return False
    
    # Patrones comunes de XSS
    xss_patterns = [
        r'<script[^>]*>',
        r'javascript:',
        r'on\w+\s*=',
        r'<iframe[^>]*>',
        r'<object[^>]*>',
        r'<embed[^>]*>',
        r'<link[^>]*>',
        r'<meta[^>]*>',
        r'expression\s*\(',
        r'vbscript:',
        r'data:text/html',
    ]
    
    text_lower = text.lower()
    for pattern in xss_patterns:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    
    return False


def log_security_event(event_type: str, details: Dict[str, Any], user_id: Optional[str] = None):
    """
    Registra un evento de seguridad
    
    Args:
        event_type: Tipo de evento (xss_attempt, invalid_input, etc.)
        details: Detalles del evento
        user_id: ID del usuario (opcional)
    """
    try:
        if current_app:
            current_app.logger.warning(
                f"Security Event: {event_type} | User: {user_id} | Details: {details}"
            )
    except Exception:
        # Si no hay app context, solo imprimir
        print(f"Security Event: {event_type} | User: {user_id} | Details: {details}")

