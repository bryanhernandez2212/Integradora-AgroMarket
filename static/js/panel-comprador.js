(() => {
    'use strict';

    // Variables globales
            let db;
            let productos = [];
            const categorias = ['frutas', 'verduras', 'semillas', 'otros'];

            // Iconos para categorías
            const categoriaIconos = {
                'frutas': '🍎',
                'verduras': '🥬',
                'semillas': '🌾',
                'otros': '📦'
            };

            // Inicializar Firebase
            async function inicializarFirebase() {
                try {
                    console.log('🔄 Inicializando Firebase...');

                    // Esperar a que Firebase esté disponible
                    let intentos = 0;
                    const maxIntentos = 20;

                    while (typeof firebase === 'undefined' && intentos < maxIntentos) {
                        await new Promise(resolve => setTimeout(resolve, 250));
                        intentos++;
                    }

                    if (typeof firebase === 'undefined') {
                        throw new Error('Firebase SDK no se cargó');
                    }

                    // Verificar configuración
                    if (!window.firebaseConfig) {
                        throw new Error('Configuración de Firebase no disponible');
                    }

                    // Inicializar Firebase si no está inicializado
                    if (firebase.apps.length === 0) {
                        firebase.initializeApp(window.firebaseConfig);
                    }

                    db = firebase.firestore();
                    db.settings({
                        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
                        ignoreUndefinedProperties: true
                    });

                    console.log('✅ Firebase inicializado correctamente');
                    return true;

                        } catch (error) {
                    console.error('❌ Error inicializando Firebase:', error);
                    return false;
                }
            }

            // Contar productos por categoría
            async function contarProductosPorCategoria() {
                try {
                    if (!db) {
                        return {};
                    }

                    const productosSnapshot = await db.collection('productos')
                        .where('activo', '==', true)
                        .get();

                    const conteos = {
                        'todos': 0,
                        'frutas': 0,
                        'verduras': 0,
                        'semillas': 0,
                        'otros': 0
                    };

                    productosSnapshot.forEach(doc => {
                        const data = doc.data();

                        // Solo contar productos con stock
                        if ((data.stock || 0) <= 0) {
                        return;
                    }

                        const categoria = (data.categoria || 'otros').toLowerCase().trim();

                        // Contar en categoría específica
                        if (conteos.hasOwnProperty(categoria)) {
                            conteos[categoria]++;
                            } else {
                            conteos['otros']++;
                        }

                        // Contar en "todos"
                        conteos['todos']++;
                    });

                    return conteos;

                } catch (error) {
                    console.error('❌ Error contando productos:', error);
                    return {};
                }
            }

            // Mostrar categorías con conteos
            async function mostrarCategorias() {
                const categoriasGrid = document.getElementById('categoriasGrid');
                const loadingCategorias = document.getElementById('loadingCategorias');

                if (!categoriasGrid) return;

                if (loadingCategorias) {
                    loadingCategorias.style.display = 'none';
                }

                // Obtener conteos de productos
                const conteos = await contarProductosPorCategoria();

                // Agregar card de "Todos los productos" al inicio
                const todasLasCategorias = [
                    {
                        nombre: 'todos',
                        nombreLegible: 'Todos los productos',
                        icono: '🛒',
                        url: '/comprador/productos',
                        conteo: conteos['todos'] || 0
                    },
                    ...categorias.map(categoria => ({
                        nombre: categoria,
                        nombreLegible: categoria.charAt(0).toUpperCase() + categoria.slice(1),
                        icono: categoriaIconos[categoria] || '📦',
                        url: `/comprador/categoria/${categoria.toLowerCase().replace(/\s+/g, '-')}`,
                        conteo: conteos[categoria] || 0
                    }))
                ];

                const categoriasHTML = todasLasCategorias.map(cat => {
                    return `
                        <div class="categoria-card" data-categoria="${cat.nombre}">
                            <a href="${cat.url}" class="categoria-link">
                                <div class="categoria-icon">${cat.icono}</div>
                                <h3>${cat.nombreLegible}</h3>
                                <p class="categoria-count">${cat.conteo} producto${cat.conteo !== 1 ? 's' : ''}</p>
                                <span class="categoria-arrow">Ver todos →</span>
                            </a>
                        </div>
                `;
                }).join('');

                categoriasGrid.innerHTML = categoriasHTML;
            }

            // Cargar productos recomendados
            async function cargarProductosRecomendados() {
                try {
                    if (!db) {
                        throw new Error('Base de datos no disponible');
                    }

                    // Limitar a 8 productos para recomendaciones (4 columnas)
                    const productosSnapshot = await db.collection('productos')
                        .where('activo', '==', true)
                        .limit(8)
                        .get();

                    productos = [];

                    productosSnapshot.forEach(doc => {
                        const data = doc.data();

                        // Solo productos con stock
                        if ((data.stock || 0) <= 0) {
                        return;
                    }

                            let imagenValida = null;
                            if (data.imagen && typeof data.imagen === 'string' && data.imagen.trim() !== '') {
                            try {
                                const url = new URL(data.imagen);
                                // Validar que sea una URL de Firebase Storage o HTTPS válida
                                if (url.protocol === 'https:' && 
                                    (url.hostname.includes('firebasestorage') || 
                                     url.hostname.includes('googleapis') ||
                                     url.hostname.includes('firebase'))) {
                                    imagenValida = data.imagen;
                                } else {
                                    console.warn('⚠️ URL de imagen no válida (no es Firebase Storage):', data.imagen);
                                }
                            } catch (e) {
                                // Imagen inválida - podría ser una ruta relativa o URL mal formada
                                console.warn('⚠️ URL de imagen inválida:', data.imagen, e);
                            }
                            }

                            productos.push({
                                id: doc.id,
                                nombre: data.nombre || 'Sin nombre',
                                precio: data.precio || 0,
                            categoria: data.categoria || 'otros',
                                stock: data.stock || 0,
                                unidad: data.unidad || 'kg',
                                imagen: imagenValida,
                            vendedor_nombre: data.vendedor_nombre || 'N/A',
                            descripcion: data.descripcion || ''
                            });
                    });

                    console.log(`✅ ${productos.length} productos recomendados cargados`);
                    mostrarProductosRecomendados(productos);

                } catch (error) {
                    console.error('❌ Error cargando productos:', error);
                    mostrarErrorProductos();
                }
            }

            // Mostrar productos recomendados con espacios para anuncios
            function mostrarProductosRecomendados(productosParaMostrar) {
                const productosGrid = document.getElementById('productosGrid');
                const loadingProducts = document.getElementById('loadingProducts');
                const emptyProducts = document.getElementById('emptyProducts');

                if (loadingProducts) {
                    loadingProducts.style.display = 'none';
                }

                if (!productosParaMostrar || productosParaMostrar.length === 0) {
                    if (productosGrid) productosGrid.style.display = 'none';
                    if (emptyProducts) emptyProducts.style.display = 'block';
                    return;
                }

                    if (emptyProducts) emptyProducts.style.display = 'none';
                    if (productosGrid) {
                        productosGrid.style.display = 'grid';

                    // Limitar a 8 productos para recomendaciones (4 filas de 4 cards)
                    const productosLimitados = productosParaMostrar.slice(0, 8);

                    // Crear HTML solo con productos, sin espacios publicitarios
                    const productosHTML = productosLimitados.map(producto => {
                            const imagenId = `producto-img-${producto.id}`;
                            const placeholderId = `producto-placeholder-${producto.id}`;
                            
                            return `
                            <article class="producto-card-popular" data-id="${producto.id}">
                                <a href="/comprador/detalle_producto/${producto.id}" class="producto-link">
                                    <div class="producto-image-popular">
                                        ${producto.imagen ? 
                                            `<img id="${imagenId}" 
                                                  data-src="${producto.imagen}" 
                                                  alt="${producto.nombre}" 
                                                  loading="lazy"
                                                  style="display: none;"
                                                  onload="this.style.display='block'; document.getElementById('${placeholderId}').style.display='none';"
                                                  onerror="console.warn('Error cargando imagen:', this.src); this.style.display='none'; const placeholder = document.getElementById('${placeholderId}'); if(placeholder) placeholder.style.display='flex';">
                                             <div id="${placeholderId}" class="producto-placeholder-popular">
                                                 <i class="fas fa-box"></i>
                                             </div>` :
                                            `<div class="producto-placeholder-popular">
                                                 <i class="fas fa-box"></i>
                                             </div>`
                                        }
                                    </div>
                                    <div class="producto-info-popular">
                                        <h4>${producto.nombre}</h4>
                                        <p class="producto-precio-popular">$${producto.precio.toFixed(2)} / ${producto.unidad}</p>
                                        <p class="producto-vendedor-popular">${producto.vendedor_nombre}</p>
                                    </div>
                                </a>
                            </article>
                            `;
                        }).join('');

                    productosGrid.innerHTML = productosHTML;
                    
                    // Cargar imágenes de forma asíncrona después de insertar el HTML
                    setTimeout(() => {
                        productosLimitados.forEach(producto => {
                            if (producto.imagen) {
                                const img = document.getElementById(`producto-img-${producto.id}`);
                                const placeholder = document.getElementById(`producto-placeholder-${producto.id}`);
                                
                                if (img && img.dataset.src) {
                                    // Intentar cargar la imagen directamente
                                    // Si falla, el onerror handler mostrará el placeholder
                                    img.src = img.dataset.src;
                                    
                                    // Timeout de seguridad: si después de 3 segundos no se cargó, mostrar placeholder
                                    setTimeout(() => {
                                        if (img && (!img.complete || !img.naturalWidth)) {
                                            console.warn('⚠️ Timeout cargando imagen del producto:', producto.id);
                                            if (placeholder) {
                                                placeholder.style.display = 'flex';
                                            }
                                            if (img) {
                                                img.style.display = 'none';
                                            }
                                        }
                                    }, 3000);
                                }
                            }
                        });
                    }, 100);
                }
            }

            function mostrarErrorProductos() {
                const loadingProducts = document.getElementById('loadingProducts');
                const productosGrid = document.getElementById('productosGrid');
                const emptyProducts = document.getElementById('emptyProducts');

                if (loadingProducts) loadingProducts.style.display = 'none';
                if (productosGrid) productosGrid.style.display = 'none';
                if (emptyProducts) {
                    emptyProducts.style.display = 'block';
                    emptyProducts.querySelector('p').textContent = 'Error al cargar productos. Intenta recargar la página.';
                }
            }

            // Inicializar cuando se carga la página
            document.addEventListener('DOMContentLoaded', async function() {
                try {
                    console.log('🚀 Iniciando panel del comprador...');

                    // Inicializar Firebase primero
                    const firebaseInicializado = await inicializarFirebase();

                    if (firebaseInicializado) {
                        // Mostrar categorías con conteos (necesita Firebase)
                        await mostrarCategorias();

                        // Cargar productos recomendados
                        await cargarProductosRecomendados();
                        console.log('✅ Panel del comprador cargado completamente');
                            } else {
                        mostrarErrorProductos();
                        // Mostrar categorías sin conteos si Firebase falla
                        mostrarCategorias();
                            }
                    } catch (error) {
                    console.error('❌ Error en panel del comprador:', error);
                    mostrarErrorProductos();
                }
            });
})();
