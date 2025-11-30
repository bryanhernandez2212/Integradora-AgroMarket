/**
 * Validación y sanitización de formularios en el frontend
 * Protege contra XSS y otros ataques
 */

// Patrones de validación
const VALIDATION_PATTERNS = {
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    phone: /^[0-9]{10,15}$/,
    name: /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s\-\']{2,100}$/,
    url: /^https?:\/\/.+/,
    price: /^\d+(\.\d{1,2})?$/
};

// Caracteres peligrosos para XSS
const DANGEROUS_PATTERNS = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe[^>]*>/i,
    /<object[^>]*>/i,
    /<embed[^>]*>/i,
    /expression\s*\(/i,
    /vbscript:/i,
    /data:text\/html/i
];

/**
 * Sanitiza un string eliminando caracteres peligrosos
 */
function sanitizeString(str, maxLength = null) {
    if (typeof str !== 'string') {
        str = String(str);
    }
    
    // Eliminar caracteres de control
    str = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    
    // Limitar longitud
    if (maxLength && str.length > maxLength) {
        str = str.substring(0, maxLength);
    }
    
    // Escapar HTML
    const div = document.createElement('div');
    div.textContent = str;
    str = div.innerHTML;
    
    return str.trim();
}

/**
 * Valida un email
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    
    email = email.trim().toLowerCase();
    
    if (email.length > 254) {
        return false;
    }
    
    return VALIDATION_PATTERNS.email.test(email);
}

/**
 * Valida un nombre
 */
function validateName(name, minLength = 2, maxLength = 100) {
    if (!name || typeof name !== 'string') {
        return false;
    }
    
    name = name.trim();
    
    if (name.length < minLength || name.length > maxLength) {
        return false;
    }
    
    return VALIDATION_PATTERNS.name.test(name);
}

/**
 * Valida un teléfono
 */
function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
        return false;
    }
    
    // Eliminar espacios, guiones y paréntesis
    phone = phone.replace(/[\s\-\(\)]/g, '');
    
    return VALIDATION_PATTERNS.phone.test(phone);
}

/**
 * Valida un precio
 */
function validatePrice(price) {
    if (price === null || price === undefined || price === '') {
        return false;
    }
    
    const priceStr = String(price).trim();
    const numPrice = parseFloat(priceStr);
    
    if (isNaN(numPrice) || numPrice < 0 || numPrice > 1000000) {
        return false;
    }
    
    return VALIDATION_PATTERNS.price.test(priceStr);
}

/**
 * Detecta intentos de XSS
 */
function detectXSS(text) {
    if (typeof text !== 'string') {
        return false;
    }
    
    const textLower = text.toLowerCase();
    
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(textLower)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Valida y sanitiza un campo de formulario
 */
function validateField(field, value, rules) {
    const errors = [];
    let sanitizedValue = value;
    
    // Sanitizar string
    if (typeof value === 'string') {
        sanitizedValue = sanitizeString(value, rules.maxLength);
    }
    
    // Validar requerido
    if (rules.required && (!sanitizedValue || sanitizedValue === '')) {
        errors.push(`El campo ${field} es requerido`);
        return { valid: false, errors, value: null };
    }
    
    // Si no es requerido y está vacío, retornar null
    if (!sanitizedValue || sanitizedValue === '') {
        return { valid: true, errors: [], value: null };
    }
    
    // Detectar XSS
    if (typeof sanitizedValue === 'string' && detectXSS(sanitizedValue)) {
        errors.push(`El campo ${field} contiene contenido no permitido`);
        console.warn(`⚠️ Intento de XSS detectado en campo ${field}`);
        return { valid: false, errors, value: null };
    }
    
    // Validar según tipo
    if (rules.type === 'email' && !validateEmail(sanitizedValue)) {
        errors.push(`El campo ${field} debe ser un email válido`);
    } else if (rules.type === 'name' && !validateName(sanitizedValue, rules.minLength, rules.maxLength)) {
        errors.push(`El campo ${field} debe ser un nombre válido (${rules.minLength}-${rules.maxLength} caracteres)`);
    } else if (rules.type === 'phone' && !validatePhone(sanitizedValue)) {
        errors.push(`El campo ${field} debe ser un teléfono válido (10-15 dígitos)`);
    } else if (rules.type === 'price' && !validatePrice(sanitizedValue)) {
        errors.push(`El campo ${field} debe ser un precio válido`);
    } else if (rules.type === 'int') {
        const num = parseInt(sanitizedValue);
        if (isNaN(num)) {
            errors.push(`El campo ${field} debe ser un número entero`);
        } else {
            if (rules.min !== undefined && num < rules.min) {
                errors.push(`El campo ${field} debe ser mayor o igual a ${rules.min}`);
            }
            if (rules.max !== undefined && num > rules.max) {
                errors.push(`El campo ${field} debe ser menor o igual a ${rules.max}`);
            }
            sanitizedValue = num;
        }
    } else if (rules.type === 'float') {
        const num = parseFloat(sanitizedValue);
        if (isNaN(num)) {
            errors.push(`El campo ${field} debe ser un número`);
        } else {
            if (rules.min !== undefined && num < rules.min) {
                errors.push(`El campo ${field} debe ser mayor o igual a ${rules.min}`);
            }
            if (rules.max !== undefined && num > rules.max) {
                errors.push(`El campo ${field} debe ser menor o igual a ${rules.max}`);
            }
            sanitizedValue = num;
        }
    }
    
    // Validar longitud
    if (rules.minLength && typeof sanitizedValue === 'string' && sanitizedValue.length < rules.minLength) {
        errors.push(`El campo ${field} debe tener al menos ${rules.minLength} caracteres`);
    }
    if (rules.maxLength && typeof sanitizedValue === 'string' && sanitizedValue.length > rules.maxLength) {
        errors.push(`El campo ${field} no puede tener más de ${rules.maxLength} caracteres`);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        value: sanitizedValue
    };
}

/**
 * Valida un formulario completo
 */
function validateForm(formElement, schema) {
    const formData = new FormData(formElement);
    const data = {};
    const errors = {};
    let isValid = true;
    
    // Convertir FormData a objeto
    for (const [key, value] of formData.entries()) {
        if (data[key]) {
            // Si ya existe, convertir a array
            if (Array.isArray(data[key])) {
                data[key].push(value);
            } else {
                data[key] = [data[key], value];
            }
        } else {
            data[key] = value;
        }
    }
    
    // Validar cada campo según el esquema
    for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        const validation = validateField(field, value, rules);
        
        if (!validation.valid) {
            isValid = false;
            errors[field] = validation.errors;
        } else {
            data[field] = validation.value;
        }
    }
    
    return {
        valid: isValid,
        errors,
        data
    };
}

/**
 * Agrega validación en tiempo real a un campo
 */
function addRealTimeValidation(inputElement, rules) {
    inputElement.addEventListener('blur', function() {
        const validation = validateField(inputElement.name || inputElement.id, inputElement.value, rules);
        
        // Remover mensajes de error anteriores
        const existingError = inputElement.parentElement.querySelector('.validation-error');
        if (existingError) {
            existingError.remove();
        }
        
        inputElement.classList.remove('error');
        
        if (!validation.valid) {
            inputElement.classList.add('error');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'validation-error';
            errorDiv.style.cssText = 'color: #dc3545; font-size: 0.85rem; margin-top: 0.25rem;';
            errorDiv.textContent = validation.errors[0];
            inputElement.parentElement.appendChild(errorDiv);
        }
    });
}

// Exportar funciones globalmente
window.SecurityValidation = {
    sanitizeString,
    validateEmail,
    validateName,
    validatePhone,
    validatePrice,
    detectXSS,
    validateField,
    validateForm,
    addRealTimeValidation
};

