/**
 * Selector de ciudades para reemplazar Google Maps Autocomplete
 * Restringe la selección a ciudades permitidas
 */

class CitySelector {
    constructor(inputId, options = {}) {
        this.input = document.getElementById(inputId);
        this.hiddenLat = document.getElementById(options.latId || inputId + '_lat');
        this.hiddenLng = document.getElementById(options.lngId || inputId + '_lng');
        this.hiddenFormatted = document.getElementById(options.formattedId || inputId + '_formatted');
        this.cities = window.SHIPPING_CONFIG ? window.SHIPPING_CONFIG.cities : [];
        this.selectedCity = null;
        
        if (!this.input) {
            console.error(`CitySelector: No se encontró el input con ID "${inputId}"`);
            return;
        }
        
        this.init();
    }
    
    init() {
        // Crear contenedor para el selector
        const container = this.input.parentElement;
        const wrapper = document.createElement('div');
        wrapper.className = 'city-selector-wrapper';
        wrapper.style.position = 'relative';
        
        const originalInput = this.input;
        const originalId = originalInput.id;
        const originalName = originalInput.name;
        const isRequired = originalInput.required;
        
        // Asegurar que el input original no participe en la validación
        originalInput.required = false;
        originalInput.removeAttribute('required');
        originalInput.disabled = true;
        
        // Reemplazar input con select
        const select = document.createElement('select');
        select.id = originalId;
        select.name = originalName;
        select.className = originalInput.className;
        select.required = isRequired;
        select.innerHTML = '<option value="">Selecciona una ciudad</option>';
        
        // Agregar opciones de ciudades
        this.cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            select.appendChild(option);
        });
        
        // Reemplazar input original
        originalInput.style.display = 'none';
        originalInput.id = `${originalId}_original`;
        originalInput.name = `${originalName}_original`;
        originalInput.tabIndex = -1;
        originalInput.setAttribute('aria-hidden', 'true');
        originalInput.setAttribute('data-city-selector-hidden', 'true');
        
        wrapper.appendChild(select);
        container.insertBefore(wrapper, originalInput);
        
        // Actualizar referencias
        this.select = select;
        this.input = select;
        
        // Event listener
        this.input.addEventListener('change', (e) => {
            this.onCityChange(e.target.value);
        });
        
        // Si hay un valor inicial en el input original, establecerlo
        const initialValue = originalInput.value || originalInput.dataset.initialValue;
        if (initialValue) {
            this.input.value = initialValue;
            this.onCityChange(initialValue);
        }
    }
    
    onCityChange(city) {
        this.selectedCity = city;
        
        // Actualizar campos hidden si existen
        if (this.hiddenFormatted) {
            this.hiddenFormatted.value = city;
        }
        
        // Disparar evento personalizado
        const event = new CustomEvent('citySelected', {
            detail: { city: city }
        });
        this.input.dispatchEvent(event);
    }
    
    getSelectedCity() {
        return this.selectedCity;
    }
    
    setCity(city) {
        if (this.input && window.SHIPPING_CONFIG.isValidCity(city)) {
            this.input.value = city;
            this.onCityChange(city);
        }
    }
}

// Función helper para inicializar selectores de ciudad
function initCitySelector(inputId, options = {}) {
    // Esperar a que SHIPPING_CONFIG esté disponible
    if (typeof window.SHIPPING_CONFIG === 'undefined') {
        console.warn('SHIPPING_CONFIG no está disponible. Cargando...');
        // Si no está disponible, cargar el script
        const script = document.createElement('script');
        script.src = '/static/js/shipping-config.js';
        script.onload = () => {
            new CitySelector(inputId, options);
        };
        document.head.appendChild(script);
    } else {
        new CitySelector(inputId, options);
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.CitySelector = CitySelector;
    window.initCitySelector = initCitySelector;
}

