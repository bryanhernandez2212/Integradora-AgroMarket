(() => {
    'use strict';

    let db;
    let productos = [];
    let productosOriginales = [];
    let queryBusqueda = '';
    let ordenActual = null; // 'precio-asc', 'precio-desc', o null
    let filtrosActivos = {
        categorias: [],
        unidades: [],
        stock: true
    };

    const rawCategoria = (document.body?.dataset?.categoria || '').trim();
    const categoriaActual = rawCategoria && rawCategoria.toLowerCase() !== 'none' ? rawCategoria : '';

    function normalizarCategoria(cat) {
        if (!cat || cat === '') return null;
        return cat.toLowerCase()
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function obtenerNombreCategoria(cat) {
        if (!cat || cat === '') return 'Todos los productos';
        return cat.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    function actualizarBreadcrumb(categoriaFiltro) {
        const breadcrumbCategoria = document.getElementById('breadcrumb-categoria');
        const breadcrumbSeparator = document.getElementById('breadcrumb-categoria-separator');

        if (!breadcrumbCategoria || !breadcrumbSeparator) return;

        if (categoriaFiltro && categoriaFiltro !== 'todos los productos') {
            breadcrumbCategoria.textContent = obtenerNombreCategoria(categoriaFiltro);
            breadcrumbCategoria.style.display = 'inline';
            breadcrumbSeparator.style.display = 'inline';
        } else {
            breadcrumbCategoria.style.display = 'none';
            breadcrumbSeparator.style.display = 'none';
        }
    }

    async function inicializarFirebase() {
        try {
            console.log('🔄 Inicializando Firebase...');

            let intentos = 0;
            const maxIntentos = 20;

            while (typeof firebase === 'undefined' && intentos < maxIntentos) {
                console.log(`⏳ Esperando Firebase... (intento ${intentos + 1}/${maxIntentos})`);
                await new Promise((resolve) => setTimeout(resolve, 250));
                intentos += 1;
            }

            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK no se cargó después de 5 segundos');
            }

            if (!window.firebaseConfig) {
                throw new Error('Configuración de Firebase no disponible');
            }

            if (firebase.apps.length === 0) {
                firebase.initializeApp(window.firebaseConfig);
            }

            db = firebase.firestore();
            db.settings({
                cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
                ignoreUndefinedProperties: true
            });

            return true;
        } catch (error) {
            console.error('❌ Error inicializando Firebase:', error);
            return false;
        }
    }

    async function cargarTodosLosProductos() {
        try {
            if (!db) {
                throw new Error('Base de datos de Firestore no está disponible');
            }

            const categoriaFiltro = normalizarCategoria(categoriaActual);

            const categoriaTitulo = document.getElementById('categoria-titulo');
            if (categoriaTitulo) {
                categoriaTitulo.textContent = obtenerNombreCategoria(categoriaActual);
            }

            actualizarBreadcrumb(categoriaFiltro);

            const productosSnapshot = await db.collection('productos').get();

            if (productosSnapshot.empty) {
                mostrarProductos([]);
                return;
            }

            productos = [];

            productosSnapshot.forEach((doc) => {
                const data = doc.data();

                if (data.activo !== true || (data.stock || 0) <= 0) {
                    return;
                }

                const categoriaProducto = normalizarCategoria(data.categoria || 'otros');

                if (categoriaFiltro && categoriaFiltro !== 'todos los productos') {
                    if (categoriaProducto !== categoriaFiltro) {
                        return;
                    }
                }

                let imagenValida = null;
                if (data.imagen && typeof data.imagen === 'string' && data.imagen.trim() !== '') {
                    try {
                        new URL(data.imagen);
                        imagenValida = data.imagen;
                    } catch (error) {
                        // imagen inválida
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
                    descripcion: data.descripcion || '',
                    origen: data.origen || 'Local',
                    activo: data.activo || false
                });
            });

            productosOriginales = [...productos];
            // Aplicar filtros iniciales
            aplicarFiltros();
        } catch (error) {
            console.error('Error cargando productos:', error);
            mostrarError('Error al cargar productos. Intenta recargar la página.');
        }
    }
        
        // Ordenar productos según el orden actual
        function ordenarProductos(productosParaOrdenar) {
            if (!productosParaOrdenar || productosParaOrdenar.length === 0) {
                return productosParaOrdenar;
            }

            if (!ordenActual) {
                return productosParaOrdenar;
            }

            const productosOrdenados = [...productosParaOrdenar];

            if (ordenActual === 'precio-asc') {
                productosOrdenados.sort((a, b) => (a.precio || 0) - (b.precio || 0));
            } else if (ordenActual === 'precio-desc') {
                productosOrdenados.sort((a, b) => (b.precio || 0) - (a.precio || 0));
            }

            return productosOrdenados;
        }

        // Mostrar productos en el grid con cards pequeñas
        function mostrarProductos(productosParaMostrar) {
            try {
                const productosGrid = document.querySelector('.productos-grid-new');
                const noProducts = document.querySelector('.no-products');
            
                if (!productosParaMostrar || productosParaMostrar.length === 0) {
                    if (productosGrid) productosGrid.style.display = 'none';
                    if (noProducts) noProducts.style.display = 'block';
                    return;
                }
                
                // Aplicar ordenamiento
                productosParaMostrar = ordenarProductos(productosParaMostrar);
                
                // Mostrar productos
                if (noProducts) noProducts.style.display = 'none';
                if (productosGrid) productosGrid.style.display = 'grid';
            
            const productosHTML = productosParaMostrar.map(producto => {
                return `
                    <article class="producto-card-small" 
                         data-id="${producto.id}" 
                         data-nombre="${producto.nombre}" 
                         data-precio="${producto.precio}"
                         data-categoria="${producto.categoria}"
                         data-stock="${producto.stock}">
                    
                        <a href="/comprador/detalle_producto/${producto.id}" class="producto-link-small" style="text-decoration: none; color: inherit;">
                            <div class="producto-image-small">
                            ${producto.imagen && producto.imagen.trim() !== '' ? 
                                    `<img src="${producto.imagen}" alt="${producto.nombre}" class="producto-img-small" 
                                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                     <div class="producto-placeholder-small" style="display: none;">
                                     <i class="fas fa-box"></i>
                                 </div>` :
                                    `<div class="producto-placeholder-small">
                                     <i class="fas fa-box"></i>
                                 </div>`
                            }
                            </div>
                            
                            <div class="producto-info-small">
                                <h4 class="producto-nombre-small">${producto.nombre}</h4>
                            
                                <div class="producto-precio-small">
                                $${producto.precio.toFixed(2)} / ${producto.unidad}
                            </div>
                            
                                <div class="producto-stock-small">
                                    <span class="stock-label">Stock:</span>
                                    <span class="stock-value">${producto.stock} ${producto.unidad}</span>
                            </div>
                            </a>
                            
                            <div class="producto-controls-small" onclick="event.stopPropagation();">
                                <div class="cantidad-controls">
                                    <button class="cantidad-btn menos" onclick="cambiarCantidad('${producto.id}', -1)">-</button>
                                    <input type="number" class="cantidad-input" id="cantidad-${producto.id}" value="1" min="1" max="${producto.stock}">
                                    <button class="cantidad-btn mas" onclick="cambiarCantidad('${producto.id}', 1)">+</button>
                                </div>
                                
                                <button class="agregar-carrito-btn" onclick="agregarAlCarrito('${producto.id}')">
                                    <i class="fas fa-cart-plus"></i>
                                    Agregar
                                </button>
                            </div>
                </article>
                `;
            }).join('');
            
            productosGrid.innerHTML = productosHTML;
            
            // Actualizar contador de productos
            const productoCount = document.getElementById('producto-count');
            if (productoCount) {
                productoCount.textContent = `${productosParaMostrar.length} productos • Disponibles`;
            }
                
                // Actualizar estado de botones de cantidad
                setTimeout(() => {
                    actualizarTodosLosBotones();
                }, 100);
            
            } catch (error) {
                console.error('Error en mostrarProductos:', error);
            }
        }
        
        // Mostrar error
    function mostrarError(mensaje) {
        const productosGrid = document.querySelector('.productos-grid-new');
        const noProducts = document.querySelector('.no-products');

        if (productosGrid) productosGrid.style.display = 'none';
        if (noProducts) {
            noProducts.innerHTML = `<p>${mensaje}</p>`;
            noProducts.style.display = 'block';
        }
    }
        
        // Función para verificar autenticación
    function verificarAutenticacion() {
        const user = firebase.auth().currentUser;
        if (user) {
            console.log('✅ Usuario autenticado en Firebase:', user.email, user.uid);
            return true;
        }
        console.log('❌ Usuario no autenticado en Firebase');
        console.log('⚠️ Si estás logueado en Flask pero no en Firebase, necesitas iniciar sesión nuevamente');
        return false;
    }
    
    // Función para esperar autenticación de Firebase
    async function esperarAutenticacionFirebase(maxEspera = 5000) {
        return new Promise((resolve) => {
            const user = firebase.auth().currentUser;
            if (user) {
                resolve(user);
                return;
            }
            
            let tiempoEsperado = 0;
            const intervalo = 500;
            const maxIntentos = maxEspera / intervalo;
            let intentos = 0;
            
            const verificar = setInterval(() => {
                intentos++;
                const currentUser = firebase.auth().currentUser;
                
                if (currentUser) {
                    clearInterval(verificar);
                    resolve(currentUser);
                } else if (intentos >= maxIntentos) {
                    clearInterval(verificar);
                    resolve(null);
                }
            }, intervalo);
            
            // También escuchar cambios de autenticación
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    clearInterval(verificar);
                    unsubscribe();
                    resolve(user);
                }
            });
            
            // Limpiar listener después de maxEspera
            setTimeout(() => {
                unsubscribe();
            }, maxEspera);
        });
    }
        
        // Función para mostrar estado de autenticación
    function mostrarEstadoAutenticacion() {
        const user = firebase.auth().currentUser;
        const navSaludo = document.querySelector('.saludo-usuario');

        if (user && navSaludo) {
            navSaludo.innerHTML = `Hola, <strong>${user.email || 'Usuario'}</strong>`;
        }
    }
        
        // Inicializar cuando se carga la página
    function manejarBusqueda(event) {
        queryBusqueda = (event.target.value || '').trim().toLowerCase();
        aplicarFiltros();
    }

    function aplicarFiltros() {
        let productosFiltrados = productosOriginales.length > 0 ? productosOriginales : productos;

        // Aplicar búsqueda primero
        if (queryBusqueda !== '') {
            productosFiltrados = productosFiltrados.filter((producto) =>
                producto.nombre.toLowerCase().includes(queryBusqueda)
                || producto.categoria.toLowerCase().includes(queryBusqueda)
                || producto.vendedor_nombre.toLowerCase().includes(queryBusqueda)
                || (producto.descripcion || '').toLowerCase().includes(queryBusqueda)
            );
        }

        // Filtrar por categorías
        if (filtrosActivos.categorias.length > 0) {
            productosFiltrados = productosFiltrados.filter(producto => {
                const categoriaNormalizada = normalizarCategoria(producto.categoria);
                return filtrosActivos.categorias.some(cat => {
                    const catSinPrefijo = cat.replace('categoria-', '');
                    return categoriaNormalizada === cat || 
                           categoriaNormalizada === catSinPrefijo ||
                           categoriaNormalizada.includes(catSinPrefijo) ||
                           catSinPrefijo.includes(categoriaNormalizada);
                });
            });
        }

        // Filtrar por unidades
        if (filtrosActivos.unidades.length > 0) {
            productosFiltrados = productosFiltrados.filter(producto => {
                const unidadNormalizada = (producto.unidad || '').toLowerCase().trim();
                return filtrosActivos.unidades.some(uni => {
                    const unidadFiltro = uni.replace('unidad-', '').toLowerCase();
                    return unidadNormalizada === unidadFiltro || 
                           unidadNormalizada.includes(unidadFiltro) ||
                           unidadFiltro.includes(unidadNormalizada);
                });
            });
        }

        // Filtrar por stock (solo productos en stock)
        if (filtrosActivos.stock) {
            productosFiltrados = productosFiltrados.filter(producto => 
                producto.stock > 0 && producto.activo === true
            );
        }

        mostrarProductos(productosFiltrados);
    }

    function manejarFiltro(btn) {
        const filterValue = btn.dataset.filter;
        
        if (!filterValue) return;

        // Toggle del botón
        btn.classList.toggle('active');
        const estaActivo = btn.classList.contains('active');

        // Manejar filtros de categoría
        if (filterValue.startsWith('categoria-')) {
            const categoria = filterValue.replace('categoria-', '');
            if (estaActivo) {
                if (!filtrosActivos.categorias.includes(categoria)) {
                    filtrosActivos.categorias.push(categoria);
                }
            } else {
                filtrosActivos.categorias = filtrosActivos.categorias.filter(c => c !== categoria);
            }
        }
        // Manejar filtros de unidad
        else if (filterValue.startsWith('unidad-')) {
            const unidad = filterValue.replace('unidad-', '');
            if (estaActivo) {
                if (!filtrosActivos.unidades.includes(unidad)) {
                    filtrosActivos.unidades.push(unidad);
                }
            } else {
                filtrosActivos.unidades = filtrosActivos.unidades.filter(u => u !== unidad);
            }
        }
        // Manejar filtro de stock
        else if (filterValue === 'stock') {
            filtrosActivos.stock = estaActivo;
        }

        aplicarFiltros();
    }

    function registrarFiltrosSidebar() {
        // Registrar filtros del sidebar (desktop)
        document.querySelectorAll('.filter-group .filter-btn').forEach((btn) => {
            btn.addEventListener('click', function() {
                manejarFiltro(this);
            });
        });

        // Registrar filtros móviles
        document.querySelectorAll('.filter-btn-mobile').forEach((btn) => {
            btn.addEventListener('click', function() {
                manejarFiltro(this);
            });
        });
    }

    function registrarControles() {
        // Dropdown de ordenamiento
        const btnOrdenar = document.getElementById('btn-ordenar');
        const sortMenu = document.getElementById('sort-dropdown-menu');
        const sortLabel = document.getElementById('sort-label');

        if (btnOrdenar && sortMenu) {
            // Toggle del dropdown
            btnOrdenar.addEventListener('click', function(e) {
                e.stopPropagation();
                sortMenu.classList.toggle('active');
            });

            // Cerrar dropdown al hacer clic fuera
            document.addEventListener('click', function(e) {
                if (!btnOrdenar.contains(e.target) && !sortMenu.contains(e.target)) {
                    sortMenu.classList.remove('active');
                }
            });

            // Manejar selección de ordenamiento
            sortMenu.querySelectorAll('.sort-option').forEach(option => {
                option.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const sortValue = this.dataset.sort;
                    
                    // Actualizar orden actual
                    ordenActual = sortValue;
                    
                    // Actualizar label del botón
                    if (sortValue === 'precio-asc') {
                        sortLabel.textContent = 'Menor a mayor';
                    } else if (sortValue === 'precio-desc') {
                        sortLabel.textContent = 'Mayor a menor';
                    }
                    
                    // Remover active de todas las opciones
                    sortMenu.querySelectorAll('.sort-option').forEach(opt => {
                        opt.classList.remove('active');
                    });
                    
                    // Agregar active a la opción seleccionada
                    this.classList.add('active');
                    
                    // Cerrar dropdown
                    sortMenu.classList.remove('active');
                    
                    // Aplicar ordenamiento
                    aplicarFiltros();
                });
            });
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const firebaseInicializado = await inicializarFirebase();

            if (firebaseInicializado) {
                verificarAutenticacion();
                mostrarEstadoAutenticacion();

                firebase.auth().onAuthStateChanged((user) => {
                    if (user) {
                        mostrarEstadoAutenticacion();
                    } else {
                        const navSaludo = document.querySelector('.saludo-usuario');
                        if (navSaludo) {
                            navSaludo.innerHTML = 'Hola, <strong>Usuario</strong>';
                        }
                    }
                });

                await cargarTodosLosProductos();
            } else {
                mostrarError('No se pudo conectar con la base de datos. Intenta recargar la página.');
            }
        } catch (error) {
            console.error('❌ Error cargando productos:', error);
            mostrarError('Error al cargar productos. Intenta recargar la página.');
        }

        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', manejarBusqueda);
        }

        registrarFiltrosSidebar();
        registrarControles();
        registrarModalFiltros();
    });

    // ===== Funciones para el modal de filtros =====
    function abrirModalFiltros() {
        const overlay = document.getElementById('filters-overlay');
        const modal = document.getElementById('filters-modal');
        
        if (overlay && modal) {
            overlay.classList.add('active');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function cerrarModalFiltros() {
        const overlay = document.getElementById('filters-overlay');
        const modal = document.getElementById('filters-modal');
        
        if (overlay && modal) {
            overlay.classList.remove('active');
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    function limpiarFiltros() {
        // Limpiar todos los filtros activos
        filtrosActivos.categorias = [];
        filtrosActivos.unidades = [];
        filtrosActivos.stock = true;

        // Remover clase active de todos los botones de filtro
        document.querySelectorAll('.filter-btn-mobile, .filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Activar solo el filtro de stock
        document.querySelectorAll('[data-filter="stock"]').forEach(btn => {
            btn.classList.add('active');
        });

        // Aplicar filtros (solo stock)
        aplicarFiltros();
    }

    function registrarModalFiltros() {
        // Botón para abrir modal
        const btnFiltrar = document.getElementById('btn-filtrar');
        if (btnFiltrar) {
            btnFiltrar.addEventListener('click', abrirModalFiltros);
        }

        // Botón para cerrar modal
        const btnCerrar = document.getElementById('filters-modal-close');
        if (btnCerrar) {
            btnCerrar.addEventListener('click', cerrarModalFiltros);
        }

        // Overlay para cerrar al hacer clic fuera
        const overlay = document.getElementById('filters-overlay');
        if (overlay) {
            overlay.addEventListener('click', cerrarModalFiltros);
        }

        // Botón limpiar filtros
        const btnLimpiar = document.getElementById('btn-limpiar-filtros');
        if (btnLimpiar) {
            btnLimpiar.addEventListener('click', limpiarFiltros);
        }

        // Botón aplicar filtros (cierra el modal)
        const btnAplicar = document.getElementById('btn-aplicar-filtros');
        if (btnAplicar) {
            btnAplicar.addEventListener('click', cerrarModalFiltros);
        }

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cerrarModalFiltros();
            }
        });
    }

        // Función para cambiar cantidad
        function cambiarCantidad(productoId, cambio) {
            const input = document.getElementById(`cantidad-${productoId}`);
            const producto = productos.find(p => p.id === productoId);
            
            if (!producto) return;
            
            let nuevaCantidad = parseInt(input.value) + cambio;
            
            // Validar límites
            if (nuevaCantidad < 1) nuevaCantidad = 1;
            if (nuevaCantidad > producto.stock) nuevaCantidad = producto.stock;
            
            input.value = nuevaCantidad;
            
            // Actualizar estado de botones
            actualizarBotonesCantidad(productoId);
        }
        
        // Función para actualizar estado de botones de cantidad
        function actualizarBotonesCantidad(productoId) {
            const input = document.getElementById(`cantidad-${productoId}`);
            const producto = productos.find(p => p.id === productoId);
            
            if (!producto) return;
            
            const cantidad = parseInt(input.value);
            const card = input.closest('.producto-card-small');
            const btnMenos = card.querySelector('.cantidad-btn.menos');
            const btnMas = card.querySelector('.cantidad-btn.mas');
            
            // Deshabilitar botones según límites
            btnMenos.disabled = cantidad <= 1;
            btnMas.disabled = cantidad >= producto.stock;
        }
        
        // Función para agregar al carrito
        async function agregarAlCarrito(productoId) {
            try {
                console.log('🛒 Iniciando proceso de agregar al carrito...');
                
                // Verificar que Firebase esté inicializado
                if (!db) {
                    throw new Error('Base de datos no está disponible');
                }
                
                // Esperar a que el usuario esté autenticado en Firebase
                console.log('🔍 Verificando autenticación en Firebase...');
                let user = await esperarAutenticacionFirebase(3000);
                
                if (!user) {
                    console.error('❌ Usuario no autenticado en Firebase');
                    console.error('⚠️ El usuario puede estar autenticado en Flask pero no en Firebase');
                    mostrarNotificacion('❌ No estás autenticado en el sistema. Por favor, <a href="/auth/login" style="color: white; text-decoration: underline;">inicia sesión</a> nuevamente.', 'error');
                    return;
                }
                
                console.log('👤 Usuario autenticado en Firebase:', user.uid, user.email);
                
                // Verificar que el token de autenticación sea válido
                let token = null;
                try {
                    token = await user.getIdToken(true); // Forzar refresco del token
                    console.log('✅ Token de autenticación válido');
                } catch (authError) {
                    console.error('❌ Error obteniendo token:', authError);
                    mostrarNotificacion('❌ Tu sesión ha expirado. Por favor, <a href="/auth/login" style="color: white; text-decoration: underline;">inicia sesión</a> nuevamente.', 'error');
                    return;
                }
                
                const producto = productos.find(p => p.id === productoId);
                if (!producto) {
                    console.error('❌ Producto no encontrado:', productoId);
                    mostrarNotificacion('❌ Producto no encontrado');
                    return;
                }
                
                const cantidad = parseInt(document.getElementById(`cantidad-${productoId}`).value);
                console.log('📦 Cantidad seleccionada:', cantidad);
                
                if (cantidad < 1 || cantidad > producto.stock) {
                    mostrarNotificacion('❌ Cantidad inválida. Verifica el stock disponible.');
                    return;
                }
                
                // Obtener datos actualizados del producto desde Firestore
                let productoActual = null;
                try {
                    const productoDoc = await db.collection('productos').doc(productoId).get();
                    if (productoDoc.exists) {
                        productoActual = { id: productoDoc.id, ...productoDoc.data() };
                    }
                } catch (error) {
                    console.warn('⚠️ No se pudo obtener producto actualizado, usando datos locales:', error);
                    productoActual = producto;
                }
                
                // Verificar si el producto ya está en el carrito
                console.log('🔍 Buscando producto en carrito...', {
                    usuario_id: user.uid,
                    producto_id: productoId
                });
                
                const carritoSnapshot = await db.collection('carrito')
                    .where('usuario_id', '==', user.uid)
                    .where('producto_id', '==', productoId)
                    .get();
                
                console.log('📋 Items encontrados en carrito:', carritoSnapshot.size);
                
                if (!carritoSnapshot.empty) {
                    // Si ya existe, actualizar la cantidad
                    const itemExistente = carritoSnapshot.docs[0];
                    const cantidadActual = itemExistente.data().cantidad || 0;
                    const nuevaCantidad = cantidadActual + cantidad;
                    const stockDisponible = (productoActual?.stock || producto.stock);
                    
                    if (nuevaCantidad > stockDisponible) {
                        mostrarNotificacion(`❌ No hay suficiente stock disponible. Stock: ${stockDisponible} ${producto.unidad}`);
                        return;
                    }
                    
                    console.log('📝 Actualizando item existente en carrito...', {
                        item_id: itemExistente.id,
                        nueva_cantidad: nuevaCantidad
                    });
                    
                    await db.collection('carrito').doc(itemExistente.id).update({
                        cantidad: nuevaCantidad,
                        fecha_agregado: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    console.log('✅ Item actualizado exitosamente');
                    mostrarNotificacion(`✅ ${cantidad} ${producto.unidad} más de ${producto.nombre} agregado al carrito`);
                } else {
                    // Si no existe, crear nuevo item
                    const vendedorId = productoActual?.vendedor_id || productoActual?.vendedorId || '';
                    
                    const itemCarrito = {
                        producto_id: productoId,
                        nombre: producto.nombre,
                        precio: producto.precio,
                        cantidad: cantidad,
                        unidad: producto.unidad,
                        imagen: producto.imagen || '',
                        vendedor_nombre: producto.vendedor_nombre || 'N/A',
                        vendedor_id: vendedorId,
                        fecha_agregado: firebase.firestore.FieldValue.serverTimestamp(),
                        usuario_id: user.uid,
                        categoria: producto.categoria || 'otros',
                        origen: producto.origen || 'Local'
                    };
                    
                    console.log('📝 Agregando nuevo item al carrito:', itemCarrito);
                    console.log('🔐 Verificando permisos antes de agregar...');
                    console.log('   - Usuario autenticado:', user.uid);
                    console.log('   - usuario_id en item:', itemCarrito.usuario_id);
                    console.log('   - Coinciden:', user.uid === itemCarrito.usuario_id);
                    
                    const docRef = await db.collection('carrito').add(itemCarrito);
                    console.log('✅ Item agregado exitosamente con ID:', docRef.id);
                    
                    mostrarNotificacion(`✅ ${cantidad} ${producto.unidad} de ${producto.nombre} agregado al carrito`);
                }
                
                // Resetear cantidad a 1
                document.getElementById(`cantidad-${productoId}`).value = 1;
                actualizarBotonesCantidad(productoId);
                
                console.log('✅ Producto agregado al carrito exitosamente');
                
            } catch (error) {
                console.error('❌ Error agregando al carrito:', error);
                console.error('❌ Detalles del error:', {
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                });
                
                // Verificar estado de autenticación actual
                const currentUser = firebase.auth().currentUser;
                console.log('🔍 Estado de autenticación actual:', currentUser ? `Autenticado: ${currentUser.email}` : 'No autenticado');
                
                let mensajeError = '❌ Error al agregar al carrito. Intenta nuevamente.';
                
                if (error.code === 'permission-denied') {
                    if (!currentUser) {
                        mensajeError = '❌ No estás autenticado. Por favor, <a href="/auth/login" style="color: white; text-decoration: underline;">inicia sesión</a> para agregar productos al carrito.';
                    } else {
                        mensajeError = '❌ No tienes permisos para agregar al carrito. Esto puede deberse a un problema con las reglas de seguridad de Firestore. Contacta al administrador.';
                        console.error('❌ Usuario autenticado pero sin permisos. UID:', currentUser.uid);
                    }
                } else if (error.code === 'unavailable') {
                    mensajeError = '❌ Servicio no disponible. Verifica tu conexión a internet.';
                } else if (error.code === 'unauthenticated' || (error.message && error.message.includes('auth'))) {
                    mensajeError = '❌ Tu sesión ha expirado. Por favor, <a href="/auth/login" style="color: white; text-decoration: underline;">inicia sesión</a> nuevamente.';
                }
                
                mostrarNotificacion(mensajeError);
            }
        }
        
        // Función para mostrar notificaciones
        function mostrarNotificacion(mensaje) {
            // Crear elemento de notificación
            const notificacion = document.createElement('div');
            notificacion.className = 'notificacion-carrito';
            notificacion.textContent = mensaje;
            
            // Agregar estilos
            notificacion.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--green);
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 8px;
                box-shadow: var(--shadow);
                z-index: 1000;
                font-weight: 500;
                animation: slideIn 0.3s ease;
            `;
            
            // Agregar animación CSS
            if (!document.querySelector('#notificacion-styles')) {
                const style = document.createElement('style');
                style.id = 'notificacion-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            document.body.appendChild(notificacion);
            
            // Remover después de 3 segundos
            setTimeout(() => {
                notificacion.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notificacion.parentNode) {
                        notificacion.parentNode.removeChild(notificacion);
                    }
                }, 300);
            }, 3000);
        }
        
        // Actualizar botones cuando se carga la página
    function actualizarTodosLosBotones() {
        productos.forEach((producto) => {
            actualizarBotonesCantidad(producto.id);
        });
    }

    window.cambiarCantidad = cambiarCantidad;
    window.agregarAlCarrito = agregarAlCarrito;
    window.ProductosComprador = {
        cambiarCantidad,
        agregarAlCarrito
    };
})();
