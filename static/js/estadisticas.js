// Script para página de estadísticas del vendedor
// Carga ventas y genera gráficas y métricas

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

async function cargarVentasParaEstadisticas() {
    try {
        const user = auth.currentUser;
        if (!user) {
            console.error('Usuario no autenticado');
            return;
        }

        const loadingEl = document.getElementById('loading-estadisticas');
        const emptyEl = document.getElementById('empty-estadisticas');
        const containerEl = document.getElementById('estadisticas-container');

        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.style.display = 'none';
        if (containerEl) containerEl.style.display = 'none';

        const comprasSnapshot = await db.collection('compras').get();

        ventasData = [];

        for (const compraDoc of comprasSnapshot.docs) {
            const compraData = compraDoc.data();

            const productos = compraData.productos || [];

            const productosVendedorPromesas = productos.map(async (producto) => {
                let vendedorId = producto.vendedor_id || '';

                if (!vendedorId && producto.producto_id) {
                    try {
                        const productoDoc = await db.collection('productos').doc(producto.producto_id).get();
                        if (productoDoc.exists) {
                            const productoData = productoDoc.data();
                            vendedorId = productoData.vendedor_id || productoData.vendedorId || '';
                        }
                    } catch (error) {
                        console.error('❌ Error obteniendo vendedor_id del producto:', error);
                    }
                }

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

                ventasData.push({
                    compra_id: compraDoc.id,
                    fecha_compra: compraData.fecha_compra?.toDate?.() ||
                                 (compraData.fecha_creacion ? new Date(compraData.fecha_creacion) : new Date()),
                    fecha_creacion: compraData.fecha_creacion || new Date().toISOString(),
                    productos: productosVendedor,
                    total: totalVenta,
                    estado: compraData.estado || 'pendiente',
                    estado_pedido: estadoPedido
                });
            }
        }

        ventasData.sort((a, b) => {
            const fechaA = a.fecha_compra instanceof Date ? a.fecha_compra.getTime() : new Date(a.fecha_creacion).getTime();
            const fechaB = b.fecha_compra instanceof Date ? b.fecha_compra.getTime() : new Date(b.fecha_creacion).getTime();
            return fechaB - fechaA;
        });

        if (loadingEl) loadingEl.style.display = 'none';

        if (ventasData.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (containerEl) containerEl.style.display = 'block';
            cargarEstadisticas();
        }

    } catch (error) {
        console.error('Error cargando ventas:', error);
        const loadingEl = document.getElementById('loading-estadisticas');
        if (loadingEl) loadingEl.style.display = 'none';

        const emptyEl = document.getElementById('empty-estadisticas');
        if (emptyEl) {
            emptyEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i><h3>Error al cargar estadísticas</h3><p>Por favor, recarga la página.</p>';
            emptyEl.style.display = 'block';
        }
    }
}

// ===== ESTADÍSTICAS Y GRÁFICAS =====
let charts = {
    ventasMes: null,
    productosVendidos: null,
    estados: null,
    ventasDia: null
};

function cargarEstadisticas() {
    const estadisticasContainer = document.getElementById('estadisticas-container');
    if (!estadisticasContainer || ventasData.length === 0) {
        if (estadisticasContainer) estadisticasContainer.style.display = 'none';
        return;
    }

    estadisticasContainer.style.display = 'block';

    // Obtener filtro de período
    const filtroPeriodo = document.getElementById('filtro-periodo-estadisticas')?.value || '30';
    
    // Filtrar ventas por período
    const ventasFiltradas = filtrarVentasPorPeriodo(ventasData, filtroPeriodo);

    // Calcular métricas
    calcularMetricas(ventasFiltradas);

    // Generar gráficas
    generarGraficas(ventasFiltradas);
}

function filtrarVentasPorPeriodo(ventas, dias) {
    if (dias === 'todos') return ventas;
    
    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(hoy.getDate() - parseInt(dias));

    return ventas.filter(venta => {
        const fechaVenta = venta.fecha_compra instanceof Date 
            ? venta.fecha_compra 
            : new Date(venta.fecha_creacion);
        return fechaVenta >= fechaLimite;
    });
}

function calcularMetricas(ventas) {
    // Total vendido
    const totalVendido = ventas.reduce((acc, v) => acc + (v.total || 0), 0);
    
    // Total de pedidos
    const totalPedidos = ventas.length;
    
    // Productos vendidos (sumar cantidades)
    const productosVendidos = ventas.reduce((acc, v) => {
        return acc + (v.productos || []).reduce((sum, p) => sum + (p.cantidad || 0), 0);
    }, 0);
    
    // Pedidos completados
    const pedidosCompletados = ventas.filter(v => {
        const estado = (v.estado_pedido || '').toLowerCase();
        return estado === 'recibido' || estado === 'entregado';
    }).length;

    // Actualizar UI
    document.getElementById('metrica-total-vendido').textContent = `$${totalVendido.toFixed(2)}`;
    document.getElementById('metrica-total-pedidos').textContent = totalPedidos.toString();
    document.getElementById('metrica-productos-vendidos').textContent = productosVendidos.toString();
    document.getElementById('metrica-pedidos-completados').textContent = pedidosCompletados.toString();
}

function generarGraficas(ventas) {
    // Destruir gráficas existentes
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });

    // Gráfica de ventas por mes
    generarGraficaVentasMes(ventas);
    
    // Gráfica de productos más vendidos
    generarGraficaProductosVendidos(ventas);
    
    // Gráfica de distribución por estado
    generarGraficaEstados(ventas);
    
    // Gráfica de ventas por día
    generarGraficaVentasDia(ventas);
}

function generarGraficaVentasMes(ventas) {
    const ctx = document.getElementById('grafica-ventas-mes');
    if (!ctx) return;

    // Agrupar por mes
    const ventasPorMes = {};
    ventas.forEach(venta => {
        const fecha = venta.fecha_compra instanceof Date 
            ? venta.fecha_compra 
            : new Date(venta.fecha_creacion);
        const mes = fecha.toLocaleString('es-MX', { month: 'short', year: 'numeric' });
        
        if (!ventasPorMes[mes]) {
            ventasPorMes[mes] = 0;
        }
        ventasPorMes[mes] += venta.total || 0;
    });

    const meses = Object.keys(ventasPorMes).sort((a, b) => {
        return new Date(a) - new Date(b);
    });
    const valores = meses.map(mes => ventasPorMes[mes]);

    charts.ventasMes = new Chart(ctx, {
        type: 'line',
        data: {
            labels: meses,
            datasets: [{
                label: 'Ventas ($)',
                data: valores,
                borderColor: '#2e8b57',
                backgroundColor: 'rgba(46, 139, 87, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

function generarGraficaProductosVendidos(ventas) {
    const ctx = document.getElementById('grafica-productos-vendidos');
    if (!ctx) return;

    // Agrupar productos
    const productosMap = {};
    ventas.forEach(venta => {
        (venta.productos || []).forEach(producto => {
            const nombre = producto.nombre || 'Producto sin nombre';
            if (!productosMap[nombre]) {
                productosMap[nombre] = {
                    cantidad: 0,
                    total: 0
                };
            }
            productosMap[nombre].cantidad += producto.cantidad || 0;
            productosMap[nombre].total += producto.precio_total || 0;
        });
    });

    // Ordenar por cantidad y tomar los top 10
    const productosArray = Object.entries(productosMap)
        .map(([nombre, datos]) => ({
            nombre: nombre.length > 20 ? nombre.substring(0, 20) + '...' : nombre,
            cantidad: datos.cantidad,
            total: datos.total
        }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);

    const nombres = productosArray.map(p => p.nombre);
    const cantidades = productosArray.map(p => p.cantidad);

    charts.productosVendidos = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: nombres,
            datasets: [{
                label: 'Cantidad Vendida',
                data: cantidades,
                backgroundColor: '#2e8b57',
                borderColor: '#246b45',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function generarGraficaEstados(ventas) {
    const ctx = document.getElementById('grafica-estados');
    if (!ctx) return;

    // Agrupar por estado
    const estadosMap = {};
    ventas.forEach(venta => {
        const estado = venta.estado_pedido || 'preparando';
        estadosMap[estado] = (estadosMap[estado] || 0) + 1;
    });

    const estados = Object.keys(estadosMap);
    const valores = estados.map(estado => estadosMap[estado]);
    
    const colores = {
        'preparando': '#ffc107',
        'enviado': '#17a2b8',
        'recibido': '#28a745',
        'entregado': '#20c997'
    };

    charts.estados = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: estados.map(e => e.charAt(0).toUpperCase() + e.slice(1)),
            datasets: [{
                data: valores,
                backgroundColor: estados.map(e => colores[e] || '#6c757d'),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        }
    });
}

function generarGraficaVentasDia(ventas) {
    const ctx = document.getElementById('grafica-ventas-dia');
    if (!ctx) return;

    // Agrupar por día (últimos 30 días)
    const ventasPorDia = {};
    const hoy = new Date();
    
    // Inicializar últimos 30 días
    for (let i = 29; i >= 0; i--) {
        const fecha = new Date(hoy);
        fecha.setDate(fecha.getDate() - i);
        const fechaStr = fecha.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
        ventasPorDia[fechaStr] = 0;
    }

    ventas.forEach(venta => {
        const fecha = venta.fecha_compra instanceof Date 
            ? venta.fecha_compra 
            : new Date(venta.fecha_creacion);
        const fechaStr = fecha.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
        
        if (ventasPorDia.hasOwnProperty(fechaStr)) {
            ventasPorDia[fechaStr] += venta.total || 0;
        }
    });

    const dias = Object.keys(ventasPorDia);
    const valores = Object.values(ventasPorDia);

    charts.ventasDia = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dias,
            datasets: [{
                label: 'Ventas ($)',
                data: valores,
                backgroundColor: 'rgba(46, 139, 87, 0.6)',
                borderColor: '#2e8b57',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    }
                }
            }
        }
    });
}

// Inicialización
document.addEventListener('DOMContentLoaded', async function() {
    const ok = await inicializarFirebase();
    if (!ok) return;

    auth.onAuthStateChanged(function(user) {
        if (user) {
            cargarVentasParaEstadisticas();
        }
    });

    if (auth.currentUser) {
        cargarVentasParaEstadisticas();
    }
});

// Hacer funciones accesibles globalmente
window.cargarEstadisticas = cargarEstadisticas;
