(() => {
    'use strict';

    let db, auth, currentUser;
    let pedidosData = [];
    let filtroEstado = 'todos';
    let ordenFechas = 'reciente';

    // Inicializar Firebase
    async function inicializarFirebase() {
        try {
            // Esperar a que Firebase esté disponible
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase SDK no está cargado');
            }

            // Intentar usar la función de inicialización global si existe
            if (typeof window.inicializarFirebase === 'function') {
                try {
                    await window.inicializarFirebase();
                } catch (e) {
                    // Si ya está inicializado, continuar
                    if (!e.message || !e.message.includes('already exists')) {
                        console.warn('Error en inicializarFirebase global:', e);
                    }
                }
            }

            // Verificar si Firebase ya está inicializado
            if (firebase.apps.length === 0) {
                // Si no está inicializado, inicializarlo directamente
                if (window.firebaseConfig) {
                    firebase.initializeApp(window.firebaseConfig);
                } else {
                    throw new Error('Configuración de Firebase no disponible');
                }
            }

            auth = firebase.auth();
            db = firebase.firestore();

            // Verificar que auth y db estén disponibles
            if (!auth || !db) {
                throw new Error('No se pudieron obtener auth o db de Firebase');
            }

            auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    cargarPedidos();
                } else {
                    window.location.href = '/auth/login';
                }
            });
        } catch (error) {
            console.error('Error inicializando Firebase:', error);
            const loadingEl = document.getElementById('loading-pedidos');
            const emptyEl = document.getElementById('empty-pedidos');
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i><h3>Error al cargar</h3><p>Por favor, recarga la página.</p>';
                emptyEl.style.display = 'block';
            }
        }
    }

    // Cargar pedidos del usuario
    async function cargarPedidos() {
        try {
            if (!db || !currentUser) {
                console.error('Firebase no inicializado - db:', !!db, 'currentUser:', !!currentUser);
                // Intentar reinicializar si es necesario
                if (!db) {
                    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                        db = firebase.firestore();
                    } else {
                        throw new Error('Firebase no está inicializado correctamente');
                    }
                }
                if (!currentUser) {
                    if (auth && auth.currentUser) {
                        currentUser = auth.currentUser;
                    } else {
                        throw new Error('Usuario no autenticado');
                    }
                }
            }

            const loadingEl = document.getElementById('loading-pedidos');
            const emptyEl = document.getElementById('empty-pedidos');
            const containerEl = document.getElementById('pedidos-container');

            // Obtener todas las compras del usuario
            // Nota: Ordenamos en el cliente para evitar necesidad de índice compuesto
            // Una vez que el índice esté listo, podemos volver a usar orderBy en la consulta
            const comprasSnapshot = await db.collection('compras')
                .where('usuario_id', '==', currentUser.uid)
                .get();

            if (comprasSnapshot.empty) {
                loadingEl.style.display = 'none';
                emptyEl.style.display = 'block';
                return;
            }

            // Primero, recopilar todos los IDs de vendedores únicos que necesitamos
            const vendedoresIds = new Set();
            const comprasData = [];
            
            for (const compraDoc of comprasSnapshot.docs) {
                const compraData = compraDoc.data();
                const productos = compraData.productos || [];
                
                // Recopilar IDs de vendedores que no tienen nombre
                productos.forEach(producto => {
                    if (!producto.vendedor_nombre && producto.vendedor_id) {
                        vendedoresIds.add(producto.vendedor_id);
                    }
                });
                
                comprasData.push({
                    id: compraDoc.id,
                    data: compraData
                });
            }

            // Cargar todos los vendedores de una vez (batch)
            const vendedoresMap = new Map();
            if (vendedoresIds.size > 0) {
                const vendedoresPromises = Array.from(vendedoresIds).map(async (vendedorId) => {
                    try {
                        const vendedorDoc = await db.collection('usuarios').doc(vendedorId).get();
                        if (vendedorDoc.exists) {
                            const vendedorData = vendedorDoc.data();
                            const vendedorNombre = vendedorData.nombre || 
                                                   vendedorData.nombre_tienda || 
                                                   vendedorData.email?.split('@')[0] || 
                                                   'Vendedor';
                            return [vendedorId, vendedorNombre];
                        }
                    } catch (error) {
                        console.warn(`Error obteniendo vendedor ${vendedorId}:`, error);
                    }
                    return [vendedorId, 'Vendedor'];
                });
                
                const vendedoresResults = await Promise.all(vendedoresPromises);
                vendedoresResults.forEach(([id, nombre]) => {
                    vendedoresMap.set(id, nombre);
                });
            }

            // Ahora procesar los pedidos con los nombres de vendedores ya cargados
            pedidosData = [];
            for (const { id, data: compraData } of comprasData) {
                // Manejar diferentes formatos de fecha
                let fechaCompra = null;
                if (compraData.fecha_compra) {
                    fechaCompra = compraData.fecha_compra.toDate ? compraData.fecha_compra.toDate() : new Date(compraData.fecha_compra);
                } else if (compraData.fecha_creacion) {
                    fechaCompra = new Date(compraData.fecha_creacion);
                } else {
                    fechaCompra = new Date();
                }

                // Obtener nombres de vendedores usando el mapa ya cargado
                const productos = compraData.productos || [];
                const productosConVendedor = productos.map((producto) => {
                    let vendedorNombre = producto.vendedor_nombre || 'Vendedor';

                    // Si no hay nombre del vendedor pero hay vendedor_id, usar el mapa
                    if (!producto.vendedor_nombre && producto.vendedor_id) {
                        vendedorNombre = vendedoresMap.get(producto.vendedor_id) || 'Vendedor';
                    }

                    return {
                        ...producto,
                        vendedor_nombre: vendedorNombre
                    };
                });

                pedidosData.push({
                    id: id,
                    fecha_compra: fechaCompra,
                    fecha_creacion: compraData.fecha_creacion || fechaCompra.toISOString(),
                    productos: productosConVendedor,
                    totales: compraData.totales || compraData,
                    total: compraData.total || 0,
                    metodo_pago: compraData.metodo_pago || 'N/A',
                    payment_intent_id: compraData.payment_intent_id || null,
                    estado: compraData.estado || 'pendiente',
                    estado_pedido: compraData.estado_pedido || 'preparando',
                    direccion_entrega: compraData.direccion_entrega || {},
                    usuario_email: compraData.usuario_email || '',
                    usuario_nombre: compraData.usuario_nombre || 'Cliente'
                });
            }

            // Ordenar por fecha de creación (más recientes primero)
            pedidosData.sort((a, b) => {
                const fechaA = a.fecha_compra instanceof Date ? a.fecha_compra.getTime() : new Date(a.fecha_creacion).getTime();
                const fechaB = b.fecha_compra instanceof Date ? b.fecha_compra.getTime() : new Date(b.fecha_creacion).getTime();
                return fechaB - fechaA;
            });

            loadingEl.style.display = 'none';
            containerEl.style.display = 'block';
            aplicarFiltros();
            setupFilterButtons();

        } catch (error) {
            console.error('Error cargando pedidos:', error);
            console.error('Detalles del error:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });

            const loadingEl = document.getElementById('loading-pedidos');
            const emptyEl = document.getElementById('empty-pedidos');
            loadingEl.style.display = 'none';

            let errorMessage = 'Error al cargar pedidos';
            if (error.message) {
                errorMessage += ': ' + error.message;
            }

            emptyEl.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <h3>${errorMessage}</h3>
                <p>Por favor, recarga la página.</p>
                <p style="font-size: 0.85rem; color: #999; margin-top: 0.5rem;">
                    Si el problema persiste, verifica tu conexión y que estés autenticado.
                </p>
            `;
            emptyEl.style.display = 'block';
        }
    }

    // Aplicar filtros y ordenamiento
    function aplicarFiltros() {
        let pedidosFiltrados = [...pedidosData];

        // Filtrar por estado
        if (filtroEstado !== 'todos') {
            pedidosFiltrados = pedidosFiltrados.filter(pedido => {
                const estado = pedido.estado_pedido || 'preparando';
                return estado.toLowerCase() === filtroEstado.toLowerCase();
            });
        }

        // Ordenar por fecha
        pedidosFiltrados.sort((a, b) => {
            const fechaA = a.fecha_compra instanceof Date ? a.fecha_compra.getTime() : new Date(a.fecha_creacion).getTime();
            const fechaB = b.fecha_compra instanceof Date ? b.fecha_compra.getTime() : new Date(b.fecha_creacion).getTime();
            return ordenFechas === 'reciente' ? fechaB - fechaA : fechaA - fechaB;
        });

        // Mostrar pedidos filtrados
        const container = document.getElementById('pedidos-container');
        if (!container) return;

        if (pedidosFiltrados.length === 0) {
            container.innerHTML = `
                <div class="empty-pedidos">
                    <i class="fas fa-filter"></i>
                    <h3>No hay pedidos con este filtro</h3>
                    <p>No se encontraron pedidos con el estado seleccionado.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pedidosFiltrados.map((pedido, index) => {
            const fecha = pedido.fecha_compra instanceof Date 
                ? pedido.fecha_compra 
                : new Date(pedido.fecha_creacion);

            const fechaFormateada = fecha.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const estadoPedido = pedido.estado_pedido || 'preparando';
            const estadoLabels = {
                'preparando': 'Preparando',
                'enviado': 'Enviado',
                'recibido': 'Recibido'
            };

            const fechaSimple = fecha.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Generar número de pedido amigable (formato: PED-YYMMDD-XXXX)
            function generarNumeroPedido(id, fecha) {
                const fechaObj = fecha instanceof Date ? fecha : new Date(fecha);
                const año = String(fechaObj.getFullYear()).slice(-2);
                const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
                const dia = String(fechaObj.getDate()).padStart(2, '0');
                const fechaFormato = `${año}${mes}${dia}`;
                const idPart = id.substring(0, 4).toUpperCase();
                return `PED-${fechaFormato}-${idPart}`;
            }

            const numeroPedido = generarNumeroPedido(pedido.id, fecha);

            // Generar lista de todos los productos
            const productosHTML = pedido.productos && pedido.productos.length > 0 
                ? pedido.productos.map((producto, idx) => {
                    const productoEstado = producto.estado_pedido || estadoPedido;
                    const vendedorNombre = producto.vendedor_nombre || 'Vendedor';
                    const vendedorId = producto.vendedor_id || producto.vendedorId || '';
                    return `
                        <div class="pedido-producto-row">
                            <div class="pedido-left-content">
                                <img src="${producto.imagen || '/static/images/product-placeholder.png'}" 
                                     alt="${producto.nombre}"
                                     class="pedido-producto-img-small"
                                     onerror="this.src='/static/images/product-placeholder.png'">
                                <div class="pedido-info-producto">
                                    <div class="pedido-estado-top ${productoEstado}">
                                        ${estadoLabels[productoEstado]}
                                    </div>
                                    <h3 class="pedido-nombre-producto">${producto.nombre}</h3>
                                    <span class="pedido-cantidad-producto">${producto.cantidad} ${producto.unidad}</span>
                                </div>
                            </div>
                            <div class="pedido-center-content">
                                <div class="pedido-vendedor-info">
                                    <strong class="vendedor-nombre">${vendedorNombre}</strong>
                                        <a class="btn-enviar-mensaje" href="/comprador/chats/${pedido.id}?vendedor=${encodeURIComponent(vendedorNombre)}${vendedorId ? `&vendedor_id=${encodeURIComponent(vendedorId)}` : ''}">
                                            <i class="fas fa-comment-dots"></i>
                                            Enviar mensaje
                                        </a>
                                </div>
                            </div>
                            <div class="pedido-right-content">
                                <div class="pedido-acciones-buttons">
                                    <a href="/comprador/detalle_pedido/${pedido.id}" class="btn-ver-compra">
                                        Ver compra
                                    </a>
                                    <button class="btn-volver-comprar" onclick="alert('Función próximamente')">
                                        Volver a comprar
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<p>Sin productos</p>';

            return `
                <div class="pedido-card-ref">
                    <div class="pedido-fecha-top">
                        <span class="pedido-numero-label">${numeroPedido}</span>
                        <span class="pedido-fecha-label">${fechaSimple}</span>
                    </div>
                    <div class="pedido-productos-container">
                        ${productosHTML}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Configurar botones de filtros desplegables
    function setupFilterButtons() {
        const filterEstadoBtn = document.getElementById('filter-estado-btn');
        const filterEstadoMenu = document.getElementById('filter-estado-menu');
        const filterEstadoText = document.getElementById('filter-estado-text');
        const filterSortBtn = document.getElementById('filter-sort-btn');
        const filterSortMenu = document.getElementById('filter-sort-menu');
        const filterSortText = document.getElementById('filter-sort-text');

        // Toggle menú de estado
        if (filterEstadoBtn && filterEstadoMenu) {
            filterEstadoBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                filterEstadoMenu.classList.toggle('show');
                filterEstadoBtn.classList.toggle('active');
                filterSortMenu.classList.remove('show');
                filterSortBtn.classList.remove('active');
            });

            // Opciones del menú de estado
            filterEstadoMenu.querySelectorAll('.filter-option[data-filter]').forEach(option => {
                option.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // Remover active de todas las opciones
                    filterEstadoMenu.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
                    // Agregar active a la opción seleccionada
                    this.classList.add('active');
                    filtroEstado = this.getAttribute('data-filter');

                    // Actualizar texto del botón
                    const texto = this.textContent.trim();
                    filterEstadoText.textContent = texto;

                    // Cerrar menú
                    filterEstadoMenu.classList.remove('show');
                    filterEstadoBtn.classList.remove('active');

                    // Aplicar filtros
                    aplicarFiltros();
                });
            });
        }

        // Toggle menú de ordenamiento
        if (filterSortBtn && filterSortMenu) {
            filterSortBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                filterSortMenu.classList.toggle('show');
                filterSortBtn.classList.toggle('active');
                filterEstadoMenu.classList.remove('show');
                filterEstadoBtn.classList.remove('active');
            });

            // Opciones del menú de ordenamiento
            filterSortMenu.querySelectorAll('.filter-option[data-sort]').forEach(option => {
                option.addEventListener('click', function(e) {
                    e.stopPropagation();
                    // Remover active de todas las opciones
                    filterSortMenu.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));
                    // Agregar active a la opción seleccionada
                    this.classList.add('active');
                    ordenFechas = this.getAttribute('data-sort');

                    // Actualizar texto del botón
                    const texto = this.textContent.trim();
                    filterSortText.textContent = texto;

                    // Cerrar menú
                    filterSortMenu.classList.remove('show');
                    filterSortBtn.classList.remove('active');

                    // Aplicar filtros
                    aplicarFiltros();
                });
            });
        }

        // Cerrar menús al hacer clic fuera
        document.addEventListener('click', function(e) {
            if (!filterEstadoBtn.contains(e.target) && !filterEstadoMenu.contains(e.target)) {
                filterEstadoMenu.classList.remove('show');
                filterEstadoBtn.classList.remove('active');
            }
            if (!filterSortBtn.contains(e.target) && !filterSortMenu.contains(e.target)) {
                filterSortMenu.classList.remove('show');
                filterSortBtn.classList.remove('active');
            }
        });
    }

    // Ver detalle del pedido (similar al modal del vendedor)
    function verDetallePedido(index) {
        const pedido = pedidosData[index];
        if (!pedido) return;

        const direccionEntrega = pedido.direccion_entrega || {};
        const ciudad = direccionEntrega.ciudad || direccionEntrega.formatted || 'No especificada';
        const telefono = direccionEntrega.telefono || 'No especificado';

        const estadoPedido = pedido.estado_pedido || 'preparando';
        const estadoLabels = {
            'preparando': 'Preparando',
            'enviado': 'Enviado',
            'recibido': 'Recibido'
        };

        const metodoPagoLabels = {
            'tarjeta': '💳 Tarjeta',
            'efectivo': '💵 Efectivo',
            'transferencia': '🏦 Transferencia'
        };

        const modalContent = `
            <div class="modal-detalles-header">
                <h2><i class="fas fa-file-invoice"></i> Detalles del Pedido</h2>
                <button class="btn-cerrar-modal" onclick="cerrarModalDetalles()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="modal-detalles-body">
                    <div class="detalle-section">
                    <h3><i class="fas fa-calendar-alt"></i> Información General</h3>
                    <div class="detalle-grid">
                        <div class="detalle-item">
                            <label>Número de Pedido:</label>
                            <span>${(function() {
                                const fechaObj = new Date(pedido.fecha_compra);
                                const año = String(fechaObj.getFullYear()).slice(-2);
                                const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
                                const dia = String(fechaObj.getDate()).padStart(2, '0');
                                const fechaFormato = año + mes + dia;
                                const idPart = pedido.id.substring(0, 4).toUpperCase();
                                return 'PED-' + fechaFormato + '-' + idPart;
                            })()}</span>
                        </div>
                        <div class="detalle-item">
                            <label>Fecha de Compra:</label>
                            <span>${new Date(pedido.fecha_compra).toLocaleString('es-MX', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</span>
                        </div>
                        <div class="detalle-item">
                            <label>Estado del Pedido:</label>
                            <span class="estado-badge-detalle estado-${estadoPedido}">
                                ${estadoLabels[estadoPedido]}
                            </span>
                        </div>
                        <div class="detalle-item">
                            <label>Método de Pago:</label>
                            <span>${metodoPagoLabels[pedido.metodo_pago] || pedido.metodo_pago}</span>
                        </div>
                        <div class="detalle-item">
                            <label>Estado de Pago:</label>
                            <span class="${pedido.estado === 'pagado' ? 'text-success' : 'text-warning'}">
                                ${pedido.estado === 'pagado' ? '✅ Pagado' : '⏳ Pendiente'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="detalle-section">
                    <h3><i class="fas fa-shopping-bag"></i> Productos (${pedido.productos.length})</h3>
                    <div class="productos-detalle-completo">
                        ${pedido.productos.map(p => `
                            <div class="producto-detalle-completo">
                                <img src="${p.imagen || '/static/images/product-placeholder.png'}" 
                                     alt="${p.nombre}"
                                     onerror="this.src='/static/images/product-placeholder.png'">
                                <div class="producto-detalle-info-completo">
                                    <h4>${p.nombre}</h4>
                                    <div class="producto-detalle-meta">
                                        <span><i class="fas fa-weight"></i> ${p.cantidad} ${p.unidad}</span>
                                        <span><i class="fas fa-dollar-sign"></i> $${p.precio_unitario?.toFixed(2) || '0.00'} c/u</span>
                                        <span class="producto-total-detalle"><strong>Total: $${p.precio_total?.toFixed(2) || '0.00'}</strong></span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="total-pedido">
                        <strong>Total del Pedido: $${pedido.total.toFixed(2)}</strong>
                    </div>
                </div>

                <div class="detalle-section">
                    <h3><i class="fas fa-map-marker-alt"></i> Información de Entrega</h3>
                    <div class="direccion-completa">
                        <div class="detalle-grid">
                            <div class="detalle-item">
                                <label>Ciudad de entrega:</label>
                                <span>${ciudad}</span>
                            </div>
                            <div class="detalle-item">
                                <label>Teléfono de contacto:</label>
                                <span>${telefono}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Crear o actualizar modal
        let modal = document.getElementById('modal-detalles-pedido');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-detalles-pedido';
            modal.className = 'modal-detalles-overlay';
            modal.innerHTML = '<div class="modal-detalles-content">' + modalContent + '</div>';
            document.body.appendChild(modal);
        } else {
            modal.querySelector('.modal-detalles-content').innerHTML = modalContent;
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function cerrarModalDetalles() {
        const modal = document.getElementById('modal-detalles-pedido');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    document.addEventListener('click', function(event) {
        const modal = document.getElementById('modal-detalles-pedido');
        if (modal && event.target === modal) {
            cerrarModalDetalles();
        }
    });

    // ===== FUNCIONES PARA DEVOLUCIONES =====
    function abrirModalDevolucion(compraId, montoTotal, paymentIntentId, emailCliente, nombreCliente) {
        const modal = document.getElementById('modal-devolucion');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            document.getElementById('devolucion-compra-id').value = compraId;
            document.getElementById('devolucion-payment-intent-id').value = paymentIntentId;
            document.getElementById('devolucion-email').value = emailCliente;
            document.getElementById('devolucion-nombre').value = nombreCliente;
            document.getElementById('devolucion-monto-total').textContent = `$${montoTotal.toFixed(2)}`;
            document.getElementById('devolucion-monto').max = montoTotal;
            document.getElementById('devolucion-tipo').value = 'completa';
            document.getElementById('devolucion-monto-group').style.display = 'none';
        } else {
            crearModalDevolucion(compraId, montoTotal, paymentIntentId, emailCliente, nombreCliente);
        }
    }

    function crearModalDevolucion(compraId, montoTotal, paymentIntentId, emailCliente, nombreCliente) {
        const modal = document.createElement('div');
        modal.id = 'modal-devolucion';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-devolucion-content">
                <div class="modal-devolucion-header">
                    <h2><i class="fas fa-undo"></i> Solicitar Devolución</h2>
                    <button class="btn-cerrar-modal" onclick="cerrarModalDevolucion()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="form-devolucion" onsubmit="procesarDevolucion(event)">
                    <input type="hidden" id="devolucion-compra-id" value="${compraId}">
                    <input type="hidden" id="devolucion-payment-intent-id" value="${paymentIntentId}">
                    <input type="hidden" id="devolucion-email" value="${emailCliente}">
                    <input type="hidden" id="devolucion-nombre" value="${nombreCliente}">

                    <div class="form-group">
                        <label>Monto total del pedido:</label>
                        <div class="monto-total-display">
                            <span id="devolucion-monto-total">$${montoTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Tipo de devolución:</label>
                        <select id="devolucion-tipo" class="form-control" onchange="toggleMontoDevolucion()">
                            <option value="completa">Devolución Completa</option>
                            <option value="parcial">Devolución Parcial</option>
                        </select>
                    </div>

                    <div class="form-group" id="devolucion-monto-group" style="display: none;">
                        <label>Monto a devolver (MXN):</label>
                        <input type="number" 
                               id="devolucion-monto" 
                               class="form-control" 
                               min="0.01" 
                               max="${montoTotal}" 
                               step="0.01"
                               placeholder="0.00">
                        <small class="form-text">Monto máximo: $${montoTotal.toFixed(2)}</small>
                    </div>

                    <div class="form-group">
                        <label>Motivo de la devolución:</label>
                        <textarea id="devolucion-motivo" 
                                  class="form-control" 
                                  rows="4" 
                                  placeholder="Describe el motivo de la devolución..."
                                  required></textarea>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn-cancelar" onclick="cerrarModalDevolucion()">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-procesar-devolucion" id="btn-procesar-devolucion">
                            <i class="fas fa-check"></i> Procesar Devolución
                        </button>
                    </div>

                    <div id="devolucion-error" class="alert alert-error" style="display: none;"></div>
                    <div id="devolucion-success" class="alert alert-success" style="display: none;"></div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function toggleMontoDevolucion() {
        const tipo = document.getElementById('devolucion-tipo').value;
        const montoGroup = document.getElementById('devolucion-monto-group');
        if (tipo === 'parcial') {
            montoGroup.style.display = 'block';
            document.getElementById('devolucion-monto').required = true;
        } else {
            montoGroup.style.display = 'none';
            document.getElementById('devolucion-monto').required = false;
        }
    }

    function cerrarModalDevolucion() {
        const modal = document.getElementById('modal-devolucion');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async function procesarDevolucion(event) {
        event.preventDefault();

        const btnSubmit = document.getElementById('btn-procesar-devolucion');
        const errorDiv = document.getElementById('devolucion-error');
        const successDiv = document.getElementById('devolucion-success');

        // Limpiar mensajes previos
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        // Obtener datos del formulario
        const compraId = document.getElementById('devolucion-compra-id').value;
        const paymentIntentId = document.getElementById('devolucion-payment-intent-id').value;
        const emailCliente = document.getElementById('devolucion-email').value;
        const nombreCliente = document.getElementById('devolucion-nombre').value;
        const tipo = document.getElementById('devolucion-tipo').value;
        const motivo = document.getElementById('devolucion-motivo').value;
        const montoTotal = parseFloat(document.getElementById('devolucion-monto-total').textContent.replace('$', ''));

        let montoDevolucion = null;
        if (tipo === 'parcial') {
            montoDevolucion = parseFloat(document.getElementById('devolucion-monto').value);
            if (!montoDevolucion || montoDevolucion <= 0) {
                errorDiv.textContent = 'Por favor, ingresa un monto válido para la devolución parcial.';
                errorDiv.style.display = 'block';
                return;
            }
            if (montoDevolucion > montoTotal) {
                errorDiv.textContent = 'El monto de devolución no puede exceder el monto total.';
                errorDiv.style.display = 'block';
                return;
            }
            // Convertir a centavos para Stripe
            montoDevolucion = Math.round(montoDevolucion * 100);
        }

        if (!motivo || motivo.trim() === '') {
            errorDiv.textContent = 'Por favor, describe el motivo de la devolución.';
            errorDiv.style.display = 'block';
            return;
        }

        // Deshabilitar botón
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

        try {
            // Llamar al endpoint de procesar devolución
            const response = await fetch('/comprador/procesar-devolucion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    compra_id: compraId,
                    payment_intent_id: paymentIntentId,
                    monto_devolucion: montoDevolucion,
                    motivo: motivo,
                    parcial: tipo === 'parcial'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al procesar la devolución');
            }

            // Guardar devolución en Firestore
            if (db && auth && auth.currentUser) {
                await db.collection('devoluciones').add({
                    compra_id: compraId,
                    payment_intent_id: paymentIntentId,
                    refund_id: data.refund_id,
                    monto_original: data.devolucion.monto_original,
                    monto_devolucion: data.devolucion.monto_devolucion,
                    tipo: data.devolucion.tipo,
                    estado: data.status,
                    motivo: motivo,
                    usuario_id: auth.currentUser.uid,
                    fecha_solicitud: new Date().toISOString(),
                    fecha_procesamiento: new Date().toISOString()
                });
            }

            // Enviar notificación por correo
            try {
                await fetch('/comprador/enviar-notificacion-devolucion', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email_cliente: emailCliente,
                        nombre_cliente: nombreCliente,
                        compra_id: compraId,
                        monto_devolucion: data.monto_devolucion,
                        moneda: data.moneda,
                        tipo: data.devolucion.tipo,
                        motivo: motivo,
                        refund_id: data.refund_id
                    })
                });
            } catch (emailError) {
                console.error('Error enviando email:', emailError);
                // No bloquear si el email falla
            }

            // Mostrar éxito
            successDiv.innerHTML = `
                <i class="fas fa-check-circle"></i> 
                <strong>¡Devolución procesada exitosamente!</strong><br>
                ID de devolución: ${data.refund_id}<br>
                El reembolso aparecerá en tu tarjeta en 5-10 días hábiles.
            `;
            successDiv.style.display = 'block';

            // Recargar pedidos después de 2 segundos
            setTimeout(() => {
                cerrarModalDevolucion();
                cargarPedidos();
            }, 3000);

        } catch (error) {
            console.error('Error procesando devolución:', error);
            errorDiv.textContent = error.message || 'Error al procesar la devolución. Por favor, intenta nuevamente.';
            errorDiv.style.display = 'block';
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fas fa-check"></i> Procesar Devolución';
        }
    }

    // Cerrar modal al hacer clic fuera
    document.addEventListener('click', function(event) {
        const modal = document.getElementById('modal-devolucion');
        if (modal && event.target === modal) {
            cerrarModalDevolucion();
        }
    });

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarFirebase);
    } else {
        inicializarFirebase();
    }


    window.verDetallePedido = verDetallePedido;
    window.cerrarModalDetalles = cerrarModalDetalles;
    window.abrirModalDevolucion = abrirModalDevolucion;
    window.cerrarModalDevolucion = cerrarModalDevolucion;
    window.procesarDevolucion = procesarDevolucion;
    window.toggleMontoDevolucion = toggleMontoDevolucion;
})();
