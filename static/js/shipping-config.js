/**
 * Configuración de ciudades y distancias para cálculo de envío
 * Fórmula actual (más económica):
 *   10 + (1.50 × kilos) + (3 × km)
 */

const SHIPPING_CONFIG = {
    // Base de costo
    baseCost: 10,
    
    // Costo por kilogramo 
    costPerKg: 2,
    
    // Costo por kilómetro 
    costPerKm: 3,
    
    // Ciudades disponibles
    cities: [
        'Ocosingo',
        'Yajalón',
        'San Cristóbal de las Casas',
        'Chilón',
        'Palenque',
        'Altamirano',
        'Tuxtla Gutiérrez',
        'Comitán de Dominguez',
        'Teopisca',
        'Bachajón',
        'Tila'
    ],
    
    // Matriz de distancias (en kilómetros)
    // Formato: { origen: { destino: distancia } }
    distances: {
        'Ocosingo': {
            'Yajalón': 54,
            'San Cristóbal de las Casas': 95,
            'Chilón': 42,
            'Palenque': 119,
            'Altamirano': 30
        },
        'San Cristóbal de las Casas': {
            'Tuxtla Gutiérrez': 59,
            'Comitán de Dominguez': 90,
            'Teopisca': 33,
            'Ocosingo': 95
        },
        'Yajalón': {
            'Chilón': 11,
            'Ocosingo': 54,
            'Bachajón': 25,
            'Tila': 26
        },
        'Chilón': {
            'Bachajón': 13,
            'Yajalón': 12,
            'Tila': 37
        },
        'Comitán de Dominguez': {
            'San Cristóbal de las Casas': 90,
            'Tuxtla Gutiérrez': 146
        }
    },
    
    /**
     * Obtener distancia entre dos ciudades
     * @param {string} origin - Ciudad de origen
     * @param {string} destination - Ciudad de destino
     * @returns {number|null} Distancia en km o null si no se encuentra
     */
    getDistance(origin, destination) {
        // Normalizar nombres de ciudades
        const normalizedOrigin = this.normalizeCityName(origin);
        const normalizedDest = this.normalizeCityName(destination);
        
        // Buscar distancia directa
        if (this.distances[normalizedOrigin] && 
            this.distances[normalizedOrigin][normalizedDest]) {
            return this.distances[normalizedOrigin][normalizedDest];
        }
        
        // Buscar distancia inversa (A->B = B->A)
        if (this.distances[normalizedDest] && 
            this.distances[normalizedDest][normalizedOrigin]) {
            return this.distances[normalizedDest][normalizedOrigin];
        }
        
        // Si no se encuentra, intentar calcular ruta más corta
        return this.findShortestPath(normalizedOrigin, normalizedDest);
    },
    
    /**
     * Normalizar nombre de ciudad para comparación
     */
    normalizeCityName(city) {
        if (!city) return '';
        return city.trim();
    },
    
    /**
     * Encontrar la ruta más corta entre dos ciudades usando Dijkstra
     */
    findShortestPath(origin, destination) {
        // Si son la misma ciudad
        if (origin === destination) return 0;
        
        // Construir grafo bidireccional
        const graph = {};
        for (const [from, destinations] of Object.entries(this.distances)) {
            if (!graph[from]) graph[from] = {};
            for (const [to, distance] of Object.entries(destinations)) {
                graph[from][to] = distance;
                if (!graph[to]) graph[to] = {};
                graph[to][from] = distance;
            }
        }
        
        // Dijkstra's algorithm
        const distances = {};
        const visited = {};
        const queue = [];
        
        // Inicializar distancias
        for (const city of this.cities) {
            distances[city] = Infinity;
        }
        distances[origin] = 0;
        queue.push({ city: origin, distance: 0 });
        
        while (queue.length > 0) {
            queue.sort((a, b) => a.distance - b.distance);
            const { city: current, distance: currentDist } = queue.shift();
            
            if (visited[current]) continue;
            visited[current] = true;
            
            if (current === destination) {
                return currentDist;
            }
            
            if (graph[current]) {
                for (const [neighbor, edgeDist] of Object.entries(graph[current])) {
                    const newDist = currentDist + edgeDist;
                    if (newDist < distances[neighbor]) {
                        distances[neighbor] = newDist;
                        queue.push({ city: neighbor, distance: newDist });
                    }
                }
            }
        }
        
        return null; // No se encontró ruta
    },
    
    /**
     * Calcular costo de envío
     * @param {string} origin - Ciudad de origen (vendedor)
     * @param {string} destination - Ciudad de destino (comprador)
     * @param {number} weight - Peso total en kilogramos
     * @returns {number|null} Costo de envío o null si no se puede calcular
     */
    calculateShippingCost(origin, destination, weight) {
        if (!origin || !destination || !weight || weight <= 0) {
            return null;
        }
        
        const distance = this.getDistance(origin, destination);
        if (distance === null) {
            console.warn(`No se encontró distancia entre ${origin} y ${destination}`);
            return null;
        }
        
        // Fórmula: 10 + (3.30 × kilos) + (10 × km)
        const cost = this.baseCost + 
                    (this.costPerKg * weight) + 
                    (this.costPerKm * distance);
        
        return Math.round(cost * 100) / 100; // Redondear a 2 decimales
    },
    
    /**
     * Validar si una ciudad está en la lista permitida
     */
    isValidCity(city) {
        if (!city) return false;
        const normalized = this.normalizeCityName(city);
        return this.cities.some(c => this.normalizeCityName(c) === normalized);
    }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.SHIPPING_CONFIG = SHIPPING_CONFIG;
}

