// Script de ventas movido desde templates/vendedor/ventas.html
// Mantiene la lógica original para manejo de ventas, estados y devoluciones

let db;
let auth;
let ventasData = [];

async function inicializarFirebase() {
    try {
        if (typeof firebase === 'undefined') return false;
        if (firebase.apps.length === 0) {
            if (window.firebaseConfig) firebase.initializeApp(window.firebaseConfig);
        }
        auth = firebase.auth();
        db = firebase.firestore();
        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
            ignoreUndefinedProperties: true
        });
        return true;
    } catch (e) {
        console.error('Error inicializando Firebase:', e);
        return false;
    }
}

async function cargarVentas() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error('Usuario no autenticado');
            return;
        }

        const loadingEl = document.getElementById('loading-ventas');
        const emptyEl = document.getElementById('empty-ventas');
        const containerEl = document.getElementById('ventas-container');

        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (containerEl) containerEl.style.display = 'none';

        const comprasSnapshot = await db.collection('compras').get();

        ventasData = [];

        for (const compraDoc of comprasSnapshot.docs) {
            const compraData = compraDoc.data();

            const estado = compraData.estado || 'pendiente';
            if (estado !== 'pagado' && estado !== 'pendiente') {
                continue;
            }

            const productos = compraData.productos || [];

            const productosVendedorPromesas = productos.map(async (producto) => {
                let vendedorId = producto.vendedor_id || '';

                if (!vendedorId && producto.producto_id) {
                    try {
                        const productoDoc = await db.collection('productos').doc(producto.producto_id).get();
                        if (productoDoc.exists) {
                            const productoData = productoDoc.data();
                            vendedorId = productoData.vendedor_id || productoData.vendedorId || '';
                            console.log('✅ vendedor_id obtenido desde producto:', {
                                producto_id: producto.producto_id,
                                vendedor_id: vendedorId,
                                producto_nombre: productoData.nombre
                            });
                        }
                    } catch (error) {
                        console.error('❌ Error obteniendo vendedor_id del producto:', error);
                    }
                }

                console.log('🔍 Producto en compra:', {
                    nombre: producto.nombre,
                    producto_id: producto.producto_id,
                    vendedor_id: vendedorId,
                    vendedor_id_tipo: typeof vendedorId,
                    user_uid: user.uid,
                    user_uid_tipo: typeof user.uid,
                    coincide: String(vendedorId) === String(user.uid)
                });

                const esDelVendedor = String(vendedorId || '') === String(user.uid);

                if (esDelVendedor) {
                    return { ...producto, vendedor_id: vendedorId };
                }
                return null;
            });

            const productosVendedorTemp = await Promise.all(productosVendedorPromesas);
            const productosVendedor = productosVendedorTemp.filter(p => p !== null);

            if (productosVendedor.length > 0) {
                const totalVenta = productosVendedor.reduce((acc, prod) =>
                    acc + (Number(prod.precio_total) || 0), 0
                );

                const estadoPedido = productosVendedor[0]?.estado_pedido ||
                                     compraData.estado_pedido ||
                                     'preparando';

                let direccionEntrega = compraData.direccion_entrega || {};

                const tieneDireccionCompleta = direccionEntrega.ciudad || direccionEntrega.telefono || direccionEntrega.formatted;
                if (!tieneDireccionCompleta && (compraData.ciudad || compraData.telefono || compraData.formatted)) {
                    direccionEntrega = {
                        ciudad: compraData.ciudad || direccionEntrega.ciudad || '',
                        telefono: compraData.telefono || direccionEntrega.telefono || '',
                        formatted: compraData.formatted || direccionEntrega.formatted || ''
                    };
                }

                ventasData.push({
                    compra_id: compraDoc.id,
                    fecha_compra: compraData.fecha_compra?.toDate?.() ||
                                 (compraData.fecha_creacion ? new Date(compraData.fecha_creacion) : new Date()),
                    fecha_creacion: compraData.fecha_creacion || new Date().toISOString(),
                    productos: productosVendedor,
                    total: totalVenta,
                    estado: compraData.estado || 'pendiente',
                    estado_pedido: estadoPedido,
                    metodo_pago: compraData.metodo_pago || 'N/A',
                    payment_intent_id: compraData.payment_intent_id || null,
                    comprador_nombre: compraData.usuario_nombre || 'Cliente',
                    comprador_email: compraData.usuario_email || '',
                    direccion_entrega: direccionEntrega
                });
            }
        }

        ventasData.sort((a, b) => {
            const fechaA = a.fecha_compra instanceof Date ? a.fecha_compra.getTime() : new Date(a.fecha_creacion).getTime();
            const fechaB = b.fecha_compra instanceof Date ? b.fecha_compra.getTime() : new Date(b.fecha_creacion).getTime();
            return fechaB - fechaA;
        });

        if (loadingEl) loadingEl.style.display = 'none';

        const ventasActivas = ventasData.filter(v => {
            const estado = (v.estado_pedido || 'preparando').toLowerCase();
            return estado !== 'recibido' && estado !== 'entregado';
        });

        const ventasEntregadas = ventasData.filter(v => {
            const estado = (v.estado_pedido || 'preparando').toLowerCase();
            return estado === 'recibido' || estado === 'entregado';
        });

        window.ventasEntregadas = ventasEntregadas;

        if (ventasActivas.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            renderVentas([]);
        } else {
            if (containerEl) containerEl.style.display = 'block';
            renderVentas(ventasActivas);
        }


    } catch (error) {
        console.error('Error cargando ventas:', error);
        const loadingEl = document.getElementById('loading-ventas');
        if (loadingEl) loadingEl.style.display = 'none';

        const emptyEl = document.getElementById('empty-ventas');
        if (emptyEl) {
            emptyEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i><h3>Error al cargar ventas</h3><p>Por favor, recarga la página.</p>';
            emptyEl.style.display = 'block';
        }
    }
}

function renderVentas(ventasAMostrar = null) {
    const container = document.getElementById('ventas-container');
    if (!container) return;

    const ventas = ventasAMostrar || ventasData;

    container.innerHTML = `
        <div class="ventas-table-container">
            <table class="ventas-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Productos</th>
                        <th>Destino</th>
                        <th>Estado</th>
                        <th>Detalles</th>
                    </tr>
                </thead>
                <tbody>
                    ${ventas.map((venta, index) => {
                        const fecha = venta.fecha_compra instanceof Date
                            ? venta.fecha_compra
                            : new Date(venta.fecha_creacion);
                        const fechaFormateada = fecha.toLocaleDateString('es-MX', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });

                        const estadoPedido = venta.estado_pedido || 'preparando';
                        const direccionEntrega = venta.direccion_entrega || {};
                        const ciudad = direccionEntrega.ciudad || direccionEntrega.formatted?.split(' (Tel:')[0] || 'No especificada';
                        const telefono = direccionEntrega.telefono || 'No especificado';
                        const formattedCompleto = direccionEntrega.formatted || '';
                        let ciudadFinal = ciudad;
                        let telefonoFinal = telefono;

                        if (formattedCompleto && ciudad === 'No especificada' && telefono === 'No especificado') {
                            const match = formattedCompleto.match(/^(.+?)\s*\(Tel:\s*([^)]+)\)$/);
                            if (match) {
                                ciudadFinal = match[1].trim();
                                telefonoFinal = match[2].trim();
                            } else if (formattedCompleto) {
                                ciudadFinal = formattedCompleto;
                            }
                        }

                        const destinoTexto = `${ciudadFinal}${telefonoFinal !== 'No especificado' ? ' (Tel: ' + telefonoFinal + ')' : ''}`;

                        return `
                            <tr class="venta-row" data-venta-index="${index}" data-compra-id="${venta.compra_id}">
                                <td class="venta-fecha-cell">
                                    <i class="fas fa-calendar-alt"></i>
                                    ${fechaFormateada}
                                </td>
                                <td class="venta-cliente-cell">
                                    <div class="cliente-info-compact">
                                        <strong>${venta.comprador_nombre}</strong>
                                        <small>${venta.comprador_email}</small>
                                    </div>
                                </td>
                                <td class="venta-productos-cell">
                                    <div class="productos-lista-simple">
                                        ${venta.productos.map(p => `
                                            <div class="producto-item-simple">
                                                <img src="${p.imagen || '/static/images/product-placeholder.png'}"
                                                     alt="${p.nombre}"
                                                     onerror="this.src='/static/images/product-placeholder.png'"
                                                     class="producto-img-simple">
                                                <div class="producto-info-simple">
                                                    <div class="producto-nombre-cantidad">
                                                        <strong class="producto-nombre-simple">${p.nombre}</strong>
                                                        <span class="producto-cantidad-simple">${p.cantidad} ${p.unidad}</span>
                                                    </div>
                                                    <span class="producto-total-simple">$${p.precio_total.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </td>
                                <td class="venta-destino-cell">
                                    <div class="destino-info">
                                        <i class="fas fa-map-marker-alt"></i>
                                        <span class="destino-texto" title="${destinoTexto}">${destinoTexto}</span>
                                    </div>
                                </td>
                                <td class="venta-estado-cell">
                                    <select class="select-estado"
                                            onchange="cambiarEstadoPedido('${venta.compra_id}', this.value, ${index})"
                                            data-estado-actual="${estadoPedido}">
                                        <option value="preparando" ${estadoPedido === 'preparando' ? 'selected' : ''}>Preparando</option>
                                        <option value="enviado" ${estadoPedido === 'enviado' ? 'selected' : ''}>Enviado</option>
                                        <option value="recibido" ${estadoPedido === 'recibido' ? 'selected' : ''}>Recibido</option>
                                    </select>
                                </td>
                                <td class="venta-detalles-cell">
                                    <div class="venta-acciones">
                                        <a class="btn-chat-venta" href="/vendedor/chats/${venta.compra_id}?comprador=${encodeURIComponent(venta.comprador_nombre || 'Cliente')}&comprador_id=${encodeURIComponent(venta.comprador_id || '')}" title="Chatear con el cliente">
                                            <i class="fas fa-comments"></i>
                                        </a>
                                    <button class="btn-ver-detalles" onclick="mostrarDetallesPedido(${index})" title="Ver detalles completos">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function mostrarDetallesPedido(index) {
    const venta = ventasData[index];
    if (!venta) return;

    const direccionEntrega = venta.direccion_entrega || {};
    let ciudad = direccionEntrega.ciudad || direccionEntrega.formatted?.split(' (Tel:')[0] || 'No especificada';
    let telefono = direccionEntrega.telefono || 'No especificado';

    const formattedCompleto = direccionEntrega.formatted || '';
    if (formattedCompleto && ciudad === 'No especificada' && telefono === 'No especificado') {
        const match = formattedCompleto.match(/^(.+?)\s*\(Tel:\s*([^)]+)\)$/);
        if (match) {
            ciudad = match[1].trim();
            telefono = match[2].trim();
        } else if (formattedCompleto) {
            ciudad = formattedCompleto;
        }
    }

    const estadoPedido = venta.estado_pedido || 'preparando';
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
                        <label>Fecha de Compra:</label>
                        <span>${new Date(venta.fecha_compra).toLocaleString('es-MX', {
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
                        <span>${metodoPagoLabels[venta.metodo_pago] || venta.metodo_pago}</span>
                    </div>
                    <div class="detalle-item">
                        <label>Estado de Pago:</label>
                        <span class="${venta.estado === 'pagado' ? 'text-success' : 'text-warning'}">
                            ${venta.estado === 'pagado' ? '✅ Pagado' : '⏳ Pendiente'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="detalle-section">
                <h3><i class="fas fa-user"></i> Información del Cliente</h3>
                <div class="detalle-grid">
                    <div class="detalle-item">
                        <label>Nombre:</label>
                        <span>${venta.comprador_nombre}</span>
                    </div>
                    <div class="detalle-item">
                        <label>Email:</label>
                        <span>${venta.comprador_email}</span>
                    </div>
                </div>
            </div>

            <div class="detalle-section">
                <h3><i class="fas fa-shopping-bag"></i> Productos (${venta.productos.length})</h3>
                <div class="productos-detalle-completo">
                    ${venta.productos.map(p => `
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
                    <strong>Total del Pedido: $${venta.total.toFixed(2)}</strong>
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

            ${venta.metodo_pago === 'tarjeta' && venta.payment_intent_id ? `
                <div class="detalle-section acciones-section">
                    <h3><i class="fas fa-cog"></i> Acciones</h3>
                    <button class="btn-procesar-devolucion-vendedor"
                            onclick="abrirModalDevolucionVendedor('${venta.compra_id}', ${venta.total}, '${venta.payment_intent_id}', '${venta.comprador_email}', '${venta.comprador_nombre}')">
                        <i class="fas fa-undo"></i> Procesar Devolución
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    let modal = document.getElementById('modal-detalles-pedido');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-detalles-pedido';
        modal.className = 'modal-detalles-overlay';
        modal.innerHTML = '<div class="modal-detalles-content"></div>';
        document.body.appendChild(modal);
    }

    modal.querySelector('.modal-detalles-content').innerHTML = modalContent;
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
    const modalDevolucion = document.getElementById('modal-devolucion-vendedor');
    if (modalDevolucion && event.target === modalDevolucion) {
        cerrarModalDevolucionVendedor();
    }
});

function abrirModalDevolucionVendedor(compraId, montoTotal, paymentIntentId, emailCliente, nombreCliente) {
    const modal = document.getElementById('modal-devolucion-vendedor');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('devolucion-v-compra-id').value = compraId;
        document.getElementById('devolucion-v-payment-intent-id').value = paymentIntentId;
        document.getElementById('devolucion-v-email').value = emailCliente;
        document.getElementById('devolucion-v-nombre').value = nombreCliente;
        document.getElementById('devolucion-v-monto-total').textContent = `$${montoTotal.toFixed(2)}`;
        document.getElementById('devolucion-v-monto').max = montoTotal;
        document.getElementById('devolucion-v-tipo').value = 'completa';
        document.getElementById('devolucion-v-monto-group').style.display = 'none';
    } else {
        crearModalDevolucionVendedor(compraId, montoTotal, paymentIntentId, emailCliente, nombreCliente);
    }
}

function crearModalDevolucionVendedor(compraId, montoTotal, paymentIntentId, emailCliente, nombreCliente) {
    const modal = document.createElement('div');
    modal.id = 'modal-devolucion-vendedor';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-devolucion-content">
            <div class="modal-devolucion-header">
                <h2><i class="fas fa-undo"></i> Procesar Devolución</h2>
                <button class="btn-cerrar-modal" onclick="cerrarModalDevolucionVendedor()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="form-devolucion-vendedor" onsubmit="procesarDevolucionVendedor(event)">
                <input type="hidden" id="devolucion-v-compra-id" value="${compraId}">
                <input type="hidden" id="devolucion-v-payment-intent-id" value="${paymentIntentId}">
                <input type="hidden" id="devolucion-v-email" value="${emailCliente}">
                <input type="hidden" id="devolucion-v-nombre" value="${nombreCliente}">
                <div class="form-group">
                    <label>Monto total del pedido:</label>
                    <div class="monto-total-display">
                        <span id="devolucion-v-monto-total">$${montoTotal.toFixed(2)}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>Tipo de devolución:</label>
                    <select id="devolucion-v-tipo" class="form-control" onchange="toggleMontoDevolucionVendedor()">
                        <option value="completa">Devolución Completa</option>
                        <option value="parcial">Devolución Parcial</option>
                    </select>
                </div>
                <div class="form-group" id="devolucion-v-monto-group" style="display: none;">
                    <label>Monto a devolver (MXN):</label>
                    <input type="number"
                           id="devolucion-v-monto"
                           class="form-control"
                           min="0.01"
                           max="${montoTotal}"
                           step="0.01"
                           placeholder="0.00">
                    <small class="form-text">Monto máximo: $${montoTotal.toFixed(2)}</small>
                </div>
                <div class="form-group">
                    <label>Motivo de la devolución:</label>
                    <textarea id="devolucion-v-motivo"
                              class="form-control"
                              rows="4"
                              placeholder="Describe el motivo de la devolución..."
                              required></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancelar" onclick="cerrarModalDevolucionVendedor()">
                        Cancelar
                    </button>
                    <button type="submit" class="btn-procesar-devolucion" id="btn-procesar-devolucion-vendedor">
                        <i class="fas fa-check"></i> Procesar Devolución
                    </button>
                </div>
                <div id="devolucion-v-error" class="alert alert-error" style="display: none;"></div>
                <div id="devolucion-v-success" class="alert alert-success" style="display: none;"></div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function toggleMontoDevolucionVendedor() {
    const tipo = document.getElementById('devolucion-v-tipo').value;
    const montoGroup = document.getElementById('devolucion-v-monto-group');
    if (tipo === 'parcial') {
        montoGroup.style.display = 'block';
        document.getElementById('devolucion-v-monto').required = true;
    } else {
        montoGroup.style.display = 'none';
        document.getElementById('devolucion-v-monto').required = false;
    }
}

function cerrarModalDevolucionVendedor() {
    const modal = document.getElementById('modal-devolucion-vendedor');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function procesarDevolucionVendedor(event) {
    event.preventDefault();

    const btnSubmit = document.getElementById('btn-procesar-devolucion-vendedor');
    const errorDiv = document.getElementById('devolucion-v-error');
    const successDiv = document.getElementById('devolucion-v-success');

    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    const compraId = document.getElementById('devolucion-v-compra-id').value;
    const paymentIntentId = document.getElementById('devolucion-v-payment-intent-id').value;
    const emailCliente = document.getElementById('devolucion-v-email').value;
    const nombreCliente = document.getElementById('devolucion-v-nombre').value;
    const tipo = document.getElementById('devolucion-v-tipo').value;
    const motivo = document.getElementById('devolucion-v-motivo').value;
    const montoTotal = parseFloat(document.getElementById('devolucion-v-monto-total').textContent.replace('$', ''));

    let montoDevolucion = null;
    if (tipo === 'parcial') {
        montoDevolucion = parseFloat(document.getElementById('devolucion-v-monto').value);
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
        montoDevolucion = Math.round(montoDevolucion * 100);
    }

    if (!motivo || motivo.trim() === '') {
        errorDiv.textContent = 'Por favor, describe el motivo de la devolución.';
        errorDiv.style.display = 'block';
        return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    try {
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
                procesado_por: 'vendedor',
                vendedor_id: auth.currentUser.uid,
                fecha_solicitud: new Date().toISOString(),
                fecha_procesamiento: new Date().toISOString()
            });
        }

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
        }

        successDiv.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <strong>¡Devolución procesada exitosamente!</strong><br>
            ID de devolución: ${data.refund_id}<br>
            Se ha enviado una notificación al cliente.
        `;
        successDiv.style.display = 'block';

        setTimeout(() => {
            cerrarModalDevolucionVendedor();
            cerrarModalDetalles();
            cargarVentas();
        }, 3000);

    } catch (error) {
        console.error('Error procesando devolución:', error);
        errorDiv.textContent = error.message || 'Error al procesar la devolución. Por favor, intenta nuevamente.';
        errorDiv.style.display = 'block';
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fas fa-check"></i> Procesar Devolución';
    }
}

async function cambiarEstadoPedido(compraId, nuevoEstado, indexVenta) {
    try {
        console.log('🔄 [CAMBIO ESTADO] Iniciando cambio de estado...', {
            compraId,
            nuevoEstado,
            indexVenta
        });

        // Verificar que Firebase esté inicializado
        if (!db || !auth) {
            console.error('❌ [CAMBIO ESTADO] Firebase no está inicializado');
            const ok = await inicializarFirebase();
            if (!ok) {
                alert('Error: No se pudo inicializar la base de datos. Por favor, recarga la página.');
                return;
            }
        }

        const compraRef = db.collection('compras').doc(compraId);
        const compraDoc = await compraRef.get();

        if (!compraDoc.exists) {
            alert('Error: No se encontró la compra');
            return;
        }

        const compraData = compraDoc.data();
        const productos = compraData.productos || [];

        const user = auth.currentUser;
        if (!user) {
            alert('Error: Usuario no autenticado');
            return;
        }

        // Logging para diagnóstico
        console.log('🔍 [CAMBIO ESTADO] Datos de la compra:', {
            compraId: compraId,
            usuarioId: compraData.usuario_id,
            vendedoresIds: compraData.vendedores_ids,
            productosCount: productos.length,
            usuarioActual: user.uid,
            usuarioActualEmail: user.email
        });

        // Verificar si el usuario está en vendedores_ids
        const vendedoresIds = compraData.vendedores_ids || [];
        const esVendedor = vendedoresIds.includes(user.uid);
        console.log('🔍 [CAMBIO ESTADO] Verificación de vendedor:', {
            esVendedor: esVendedor,
            vendedoresIds: vendedoresIds,
            usuarioUid: user.uid
        });

        // Verificar si tiene productos del vendedor
        const productosDelVendedor = productos.filter(p => {
            const vendedorId = p.vendedor_id || p.vendedorId || '';
            return String(vendedorId) === String(user.uid);
        });
        console.log('🔍 [CAMBIO ESTADO] Productos del vendedor:', {
            cantidad: productosDelVendedor.length,
            productos: productosDelVendedor.map(p => ({
                nombre: p.nombre,
                vendedor_id: p.vendedor_id || p.vendedorId
            }))
        });

        if (productosDelVendedor.length === 0 && !esVendedor) {
            console.error('❌ [CAMBIO ESTADO] El usuario no es vendedor de esta compra');
            alert('Error: No tienes permisos para cambiar el estado de este pedido. No eres vendedor de los productos en esta compra.');
            return;
        }

        const productosActualizados = productos.map(producto => {
            let vendedorId = producto.vendedor_id || producto.vendedorId || '';

            if (String(vendedorId) === String(user.uid)) {
                return {
                    ...producto,
                    estado_pedido: nuevoEstado,
                    fecha_actualizacion_estado: new Date().toISOString()
                };
            }

            return producto;
        });

        // Asegurar que el vendedor esté en vendedores_ids para cumplir con las reglas de Firestore
        let vendedoresIdsActualizados = compraData.vendedores_ids || [];
        if (!vendedoresIdsActualizados.includes(user.uid)) {
            vendedoresIdsActualizados = [...vendedoresIdsActualizados, user.uid];
        }

        // Obtener el estado anterior antes de actualizar
        const estadoAnterior = compraData.estado_pedido || 'preparando';
        
        console.log('📝 [CAMBIO ESTADO] Intentando actualizar compra:', {
            compraId: compraId,
            nuevoEstado: nuevoEstado,
            estadoAnterior: estadoAnterior,
            vendedoresIds: vendedoresIdsActualizados
        });
        
        try {
            console.log('📝 [CAMBIO ESTADO] Preparando actualización:', {
                compraId,
                nuevoEstado,
                productosCount: productosActualizados.length
            });

            await compraRef.update({
                productos: productosActualizados,
                estado_pedido: nuevoEstado,
                fecha_actualizacion_estado: firebase.firestore.FieldValue.serverTimestamp(),
                vendedores_ids: vendedoresIdsActualizados
            });
            console.log('✅ [CAMBIO ESTADO] Compra actualizada exitosamente');
        } catch (error) {
            console.error('❌ [CAMBIO ESTADO] Error al actualizar:', error);
            console.error('❌ [CAMBIO ESTADO] Detalles del error:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            
            let mensajeError = 'Error al actualizar el estado del pedido: ';
            if (error.code === 'permission-denied') {
                mensajeError += 'No tienes permisos para realizar esta acción. Verifica que seas el vendedor de este producto.';
            } else if (error.code === 'not-found') {
                mensajeError += 'No se encontró la compra.';
            } else {
                mensajeError += error.message || 'Error desconocido';
            }
            
            alert(mensajeError);
            throw error;
        }

        console.log('✅ Estado del pedido actualizado:', nuevoEstado);

        // Actualizar UI localmente antes de recargar
        if (ventasData[indexVenta]) {
            ventasData[indexVenta].estado_pedido = nuevoEstado;
            ventasData[indexVenta].productos = ventasData[indexVenta].productos.map(p => ({
                ...p,
                estado_pedido: nuevoEstado
            }));
        }

        // Recargar ventas primero para actualizar la vista
        await cargarVentas();

        // Enviar correo de notificación de cambio de estado (en segundo plano, no bloquea)
        // Asegurar que el compraId esté en los datos
        const compraDataConId = { 
            ...compraData, 
            id: compraId,
            compra_id: compraId 
        };
        
        console.log('📧 Preparando envío de correo de cambio de estado...', {
            compraId: compraId,
            nuevoEstado: nuevoEstado,
            estadoAnterior: estadoAnterior,
            emailCliente: compraData.usuario_email
        });
        
        // Enviar correo en segundo plano sin bloquear
        enviarCorreoCambioEstado(compraDataConId, nuevoEstado, estadoAnterior, user)
            .then(() => {
                console.log('✅ Correo de cambio de estado enviado exitosamente');
            })
            .catch((emailError) => {
                console.warn('⚠️ Error enviando correo de cambio de estado:', emailError);
                // No mostrar error al usuario, solo loguearlo
            });

    } catch (error) {
        console.error('❌ Error cambiando estado del pedido:', error);
        console.error('❌ Código del error:', error.code);
        console.error('❌ Mensaje del error:', error.message);
        console.error('❌ Stack completo:', error.stack);
        
        let mensajeError = 'Error al cambiar el estado del pedido. ';
        
        if (error.code === 'permission-denied') {
            mensajeError += 'No tienes permisos para realizar esta acción. Verifica que seas el vendedor de este producto.';
        } else if (error.code === 'not-found') {
            mensajeError += 'No se encontró la compra. Por favor, recarga la página.';
        } else if (error.message) {
            mensajeError += error.message;
        } else {
            mensajeError += 'Por favor, intenta nuevamente.';
        }
        
        alert(mensajeError);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const ok = await inicializarFirebase();
    if (!ok) return;

    auth.onAuthStateChanged(function(user) {
        if (user) {
            cargarVentas();
        }
    });

    if (auth.currentUser) {
        cargarVentas();
    }

    const btnPedidosEntregados = document.getElementById('btn-pedidos-entregados');
    if (btnPedidosEntregados) {
        btnPedidosEntregados.addEventListener('click', mostrarPedidosEntregados);
    }
});

function mostrarPedidosEntregados() {
    const ventasEntregadas = window.ventasEntregadas || [];

    if (ventasEntregadas.length === 0) {
        alert('No hay pedidos entregados aún');
        return;
    }

    const modalHTML = `
        <div class="modal-entregados-overlay" id="modal-entregados-overlay">
            <div class="modal-entregados-content">
                <div class="modal-entregados-header">
                    <h2><i class="fas fa-check-circle"></i> Pedidos Entregados</h2>
                    <button class="btn-cerrar-modal" onclick="cerrarModalEntregados()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-entregados-body">
                    <table class="ventas-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Cliente</th>
                                <th>Productos</th>
                                <th>Destino</th>
                                <th>Total</th>
                                <th>Estado</th>
                                <th>Detalles</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ventasEntregadas.map((venta, index) => {
                                const fecha = venta.fecha_compra instanceof Date
                                    ? venta.fecha_compra
                                    : new Date(venta.fecha_creacion);
                                const fechaFormateada = fecha.toLocaleDateString('es-MX', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                });

                                const estadoPedido = venta.estado_pedido || 'recibido';
                                const direccionEntrega = venta.direccion_entrega || {};
                                let ciudad = direccionEntrega.ciudad || direccionEntrega.formatted?.split(' (Tel:')[0] || 'No especificada';
                                let telefono = direccionEntrega.telefono || 'No especificado';
                                const formattedCompleto = direccionEntrega.formatted || '';
                                if (formattedCompleto && ciudad === 'No especificada' && telefono === 'No especificado') {
                                    const match = formattedCompleto.match(/^(.+?)\s*\(Tel:\s*([^)]+)\)$/);
                                    if (match) {
                                        ciudad = match[1].trim();
                                        telefono = match[2].trim();
                                    } else if (formattedCompleto) {
                                        ciudad = formattedCompleto;
                                    }
                                }

                                const destinoTexto = `${ciudad}${telefono !== 'No especificado' ? ' (Tel: ' + telefono + ')' : ''}`;

                                return `
                                    <tr class="venta-row">
                                        <td class="venta-fecha-cell">
                                            <i class="fas fa-calendar-alt"></i>
                                            ${fechaFormateada}
                                        </td>
                                        <td class="venta-cliente-cell">
                                            <div class="cliente-info-compact">
                                                <strong>${venta.comprador_nombre}</strong>
                                                <small>${venta.comprador_email}</small>
                                            </div>
                                        </td>
                                        <td class="venta-productos-cell">
                                            <div class="productos-lista-simple">
                                                ${venta.productos.map(producto => `
                                                    <div class="producto-item-simple">
                                                        <img src="${producto.imagen || '/static/images/product-placeholder.png'}"
                                                             alt="${producto.nombre}"
                                                             class="producto-img-simple"
                                                             onerror="this.src='/static/images/product-placeholder.png'">
                                                        <div class="producto-info-simple">
                                                            <span class="producto-nombre-simple">${producto.nombre}</span>
                                                            <span class="producto-nombre-cantidad">${producto.cantidad} ${producto.unidad}</span>
                                                            <span class="producto-total-simple">$${producto.precio_total?.toFixed(2) || '0.00'}</span>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </td>
                                        <td class="venta-destino-cell">
                                            <div class="destino-info">
                                                <i class="fas fa-map-marker-alt"></i>
                                                <span class="destino-texto">${destinoTexto}</span>
                                            </div>
                                        </td>
                                        <td class="venta-total-cell">
                                            <strong>$${venta.total.toFixed(2)}</strong>
                                        </td>
                                        <td class="venta-estado-cell">
                                            <span class="estado-badge recibido">Recibido</span>
                                        </td>
                                        <td class="venta-detalles-cell">
                                            <button class="btn-ver-detalles" onclick="mostrarDetallesPedidoEntregado(${index})" title="Ver detalles completos">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    window.ventasEntregadasParaModal = ventasEntregadas;

    document.getElementById('modal-entregados-overlay').addEventListener('click', function(e) {
        if (e.target.id === 'modal-entregados-overlay') {
            cerrarModalEntregados();
        }
    });
}

function cerrarModalEntregados() {
    const modal = document.getElementById('modal-entregados-overlay');
    if (modal) {
        modal.remove();
    }
}

function mostrarDetallesPedidoEntregado(index) {
    const venta = window.ventasEntregadasParaModal[index];
    if (!venta) return;

    const indexCompleto = ventasData.findIndex(v => v.compra_id === venta.compra_id);
    if (indexCompleto !== -1) {
        mostrarDetallesPedido(indexCompleto);
    }
}

window.mostrarDetallesPedido = mostrarDetallesPedido;
window.cerrarModalDetalles = cerrarModalDetalles;
window.abrirModalDevolucionVendedor = abrirModalDevolucionVendedor;
window.toggleMontoDevolucionVendedor = toggleMontoDevolucionVendedor;
window.cerrarModalDevolucionVendedor = cerrarModalDevolucionVendedor;
window.procesarDevolucionVendedor = procesarDevolucionVendedor;
async function enviarCorreoCambioEstado(compraData, nuevoEstado, estadoAnterior, vendedorUser) {
    try {
        console.log('📧 Iniciando envío de correo de cambio de estado...', {
            compraData: {
                id: compraData.id,
                compra_id: compraData.compra_id,
                usuario_email: compraData.usuario_email,
                usuario_nombre: compraData.usuario_nombre,
                productos_count: compraData.productos?.length || 0
            },
            nuevoEstado: nuevoEstado,
            estadoAnterior: estadoAnterior
        });
        
        // Obtener datos del cliente
        const emailCliente = compraData.usuario_email || '';
        const nombreCliente = compraData.usuario_nombre || 'Cliente';
        
        // Obtener el ID de la compra desde la referencia o los datos
        let compraId = compraData.id || compraData.compra_id || '';
        
        if (!compraId) {
            console.error('❌ No se encontró compraId en los datos de la compra');
            return;
        }
        
        if (!emailCliente) {
            console.warn('⚠️ No se encontró email del cliente, no se puede enviar correo');
            return;
        }

        // Obtener nombre del vendedor
        let vendedorNombre = 'Vendedor';
        try {
            if (vendedorUser && vendedorUser.uid) {
                const vendedorDoc = await db.collection('usuarios').doc(vendedorUser.uid).get();
                if (vendedorDoc.exists) {
                    const vendedorData = vendedorDoc.data();
                    vendedorNombre = vendedorData.nombre || vendedorData.nombre_tienda || vendedorUser.displayName || 'Vendedor';
                }
            }
        } catch (error) {
            console.warn('⚠️ Error obteniendo nombre del vendedor:', error);
        }

        // Obtener productos del pedido (solo los del vendedor actual si es necesario)
        const productos = compraData.productos || [];
        
        console.log('📧 Datos para enviar correo:', {
            email: emailCliente,
            nombre: nombreCliente,
            compraId: compraId,
            nuevoEstado: nuevoEstado,
            estadoAnterior: estadoAnterior,
            productos_count: productos.length,
            vendedorNombre: vendedorNombre
        });
        
        // Enviar correo usando Flask-Mail directamente
        console.log('📧 Enviando correo vía Flask-Mail...');
        const response = await fetch('/comprador/api/enviar-correo-cambio-estado', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
            email: emailCliente,
            nombre: nombreCliente,
            compraId: compraId,
            nuevoEstado: nuevoEstado,
            estadoAnterior: estadoAnterior,
            productos: productos,
            vendedorNombre: vendedorNombre,
                fechaActualizacion: new Date().toLocaleString('es-MX'),
                year: new Date().getFullYear().toString()
            }),
            credentials: 'same-origin'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en respuesta:', response.status, errorText);
            throw new Error(`Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📧 Resultado:', result);
        
        if (result.success) {
            console.log('✅ Correo de cambio de estado enviado exitosamente:', result);
        } else {
            console.warn('⚠️ Error en respuesta:', result.error);
            throw new Error(result.error || 'Error al enviar correo');
        }
    } catch (error) {
        console.error('❌ Error enviando correo de cambio de estado:', error);
        console.error('Stack:', error.stack);
        // No lanzar el error, solo loguearlo
    }
}

window.cambiarEstadoPedido = cambiarEstadoPedido;
window.mostrarPedidosEntregados = mostrarPedidosEntregados;
window.cerrarModalEntregados = cerrarModalEntregados;
window.mostrarDetallesPedidoEntregado = mostrarDetallesPedidoEntregado;


