(() => {
const common = window.ProductosCommon;

if (!common) {
    console.error('❌ ProductosCommon no está disponible. Asegúrate de cargar productos-common.js antes de mis-productos.js');
    return;
}

const { ensureFirebase, mostrarMensaje, actualizarSaludoUsuario } = common;

let auth = null;
let db = null;
let storage = null;

let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const PAGE_SIZE = 15;

// Filtros activos
let activeFilters = {
    search: '',
    category: null,
    status: null
};

function getVisibleProducts() {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
}

function applyFilters() {
    filteredProducts = allProducts.filter(producto => {
        // Filtro de búsqueda (nombre o descripción)
        if (activeFilters.search) {
            const searchTerm = activeFilters.search.toLowerCase();
            const nombre = (producto.nombre || '').toLowerCase();
            const descripcion = (producto.descripcion || '').toLowerCase();
            if (!nombre.includes(searchTerm) && !descripcion.includes(searchTerm)) {
                return false;
            }
        }
        
        // Filtro de categoría
        if (activeFilters.category) {
            const categoria = capitalizar(producto.categoria || 'Sin categoría');
            if (categoria !== activeFilters.category) {
                return false;
            }
        }
        
        // Filtro de estado
        if (activeFilters.status !== null) {
            const activo = producto.activo !== false;
            if (activeFilters.status === 'activo' && !activo) {
                return false;
            }
            if (activeFilters.status === 'pausado' && activo) {
                return false;
            }
        }
        
        return true;
    });
    
    currentPage = 1; // Resetear a la primera página
    renderProducts(getVisibleProducts());
}

function updatePagination(total) {
    const container = document.getElementById('paginationContainer');
    const info = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (!container || !info || !prevBtn || !nextBtn) {
        return;
    }

    container.style.display = total > PAGE_SIZE ? 'flex' : 'none';

    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end = Math.min(currentPage * PAGE_SIZE, total);

    info.textContent = `Mostrando ${start}-${end} de ${total} productos`;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage * PAGE_SIZE >= total;
}

const statusBox = document.getElementById('statusBox');
const statusText = document.getElementById('statusText');

function setStatus(message, type = 'info', autoHide = true) {
    if (!statusBox || !statusText) {
        if (type === 'error') {
            console.error(message);
        } else {
            console.log(message);
        }
        return;
    }

    statusText.innerHTML = message;
    statusBox.style.display = 'block';

    const palettes = {
        success: { background: '#d4edda', border: '#c3e6cb', color: '#155724' },
        error: { background: '#f8d7da', border: '#f5c6cb', color: '#721c24' },
        warning: { background: '#fff3cd', border: '#ffeeba', color: '#856404' },
        info: { background: '#e7f3ff', border: '#b3d9ff', color: '#0c5460' }
    };

    const palette = palettes[type] || palettes.info;
    statusBox.style.background = palette.background;
    statusBox.style.borderColor = palette.border;
    statusBox.style.color = palette.color;

    if (autoHide) {
        setTimeout(() => {
            statusBox.style.display = 'none';
        }, 3000);
    }
}

function hideStatus() {
    if (statusBox) {
        statusBox.style.display = 'none';
    }
}

window.cerrarSesion = function cerrarSesion() {
    if (!auth) {
        window.location.href = '/auth/login';
        return;
    }

    auth.signOut().then(() => {
        window.location.href = '/';
    }).catch((error) => {
        setStatus('Error al cerrar sesión: ' + error.message, 'error');
    });
};

function capitalizar(texto) {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

async function obtenerImagenDesdeFirestore(ref) {
    try {
        const docId = ref.replace('firestore://imagenes_productos/', '');
        const doc = await db.collection('imagenes_productos').doc(docId).get();
        if (!doc.exists) {
            console.warn('Documento de imagen no encontrado:', ref);
            return null;
        }

        const data = doc.data();
        const mime = data.tipo || data.contentType || 'image/jpeg';
        const base64 = data.datos || data.data;
        if (!base64) {
            console.warn('Documento de imagen sin datos base64:', ref);
            return null;
        }

        return `data:${mime};base64,${base64}`;
    } catch (error) {
        console.error('Error al obtener imagen desde Firestore:', error);
        return null;
    }
}

async function prepararProductos(productos) {
    return Promise.all(productos.map(async (producto) => {
        let imagenUrl = producto.imagen;

        if (!imagenUrl && Array.isArray(producto.imagenes) && producto.imagenes.length) {
            imagenUrl = producto.imagenes[0];
        }

        if (imagenUrl && imagenUrl.startsWith('firestore://imagenes_productos/')) {
            imagenUrl = await obtenerImagenDesdeFirestore(imagenUrl);
        }

        return {
            ...producto,
            imagenUrl
        };
    }));
}

function renderProducts(productos) {
    const table = document.getElementById('productsTable');
    const body = document.getElementById('productsBody');
    const loader = document.getElementById('productsLoader');
    const empty = document.getElementById('productsEmpty');
    const cardsContainer = document.getElementById('productsCardsContainer');
    const isMobile = window.innerWidth <= 768;

    if (!table || !body) {
        console.error('Tabla de productos no encontrada');
        return;
    }

    if (loader) loader.style.display = 'none';

    // Limpiar y ocultar contenedores de productos
    if (table) table.style.display = 'none';
    if (cardsContainer) {
        cardsContainer.style.display = 'none';
        cardsContainer.innerHTML = ''; // Limpiar contenido de cards
    }
    if (empty) empty.style.display = 'none';
    body.innerHTML = '';

    if (!productos.length) {
        // Determinar el mensaje según si hay filtros activos
        const hasActiveFilters = activeFilters.search || activeFilters.category || activeFilters.status !== null;
        const message = hasActiveFilters 
            ? 'No se encontraron productos que coincidan con los filtros aplicados.'
            : 'Comienza agregando tu primer producto.';
        const showAddButton = !hasActiveFilters;
        
        if (empty) {
            empty.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-${hasActiveFilters ? 'search' : 'box-open'}"></i>
                    <h4>${hasActiveFilters ? 'Sin resultados' : 'No hay productos'}</h4>
                    <p>${message}</p>
                    ${showAddButton ? `
                        <button class="action-pill" onclick="window.location.href='/vendedor/agregar_producto'">
                            Agregar producto
                        </button>
                    ` : `
                        <button class="action-pill" onclick="window.clearFilters()">
                            Limpiar filtros
                        </button>
                    `}
                </div>
            `;
            empty.style.display = 'block';
        }
        hideStatus();
        updatePagination(0);
        return;
    }

    if (empty) empty.style.display = 'none';
    
    if (isMobile) {
        // Asegurarse de que el contenedor de cards existe y está limpio
        let cardsContainer = document.getElementById('productsCardsContainer');
        if (!cardsContainer) {
            cardsContainer = document.createElement('div');
            cardsContainer.id = 'productsCardsContainer';
            cardsContainer.className = 'products-cards-container';
            table.parentNode.insertBefore(cardsContainer, table);
        } else {
            cardsContainer.innerHTML = ''; // Limpiar contenido anterior
        }
        
        // Renderizar cards en móvil
        const cards = productos.map((producto, index) => {
            const nombre = producto.nombre || 'Sin nombre';
            const descripcion = producto.descripcion || 'Sin descripción';
            const categoria = capitalizar(producto.categoria || 'Sin categoría');
            const unidad = capitalizar(producto.unidad || 'Sin unidad');
            const precioOriginal = Number(producto.precio) || 0;
            const descuento = Number(producto.descuento) || 0;
            const precioConDescuento = descuento > 0 && precioOriginal > 0 
                ? precioOriginal * (1 - descuento / 100) 
                : null;
            const precio = precioConDescuento || precioOriginal;
            const stock = Number(producto.stock) || 0;
            const imagenUrl = producto.imagenUrl || null;
            const activo = producto.activo !== false;
            const statusLabel = activo ? 'Activo' : 'Pausado';
            const pauseLabel = activo ? 'Pausar' : 'Reanudar';
            const cardId = `product-card-${producto.id}-${index}`;

            return `
                <div class="product-card" id="${cardId}">
                    <div class="product-card-header">
                        ${imagenUrl ? `
                            <img src="${imagenUrl}" alt="${nombre}" class="product-card-image">
                        ` : `
                            <div class="product-card-image placeholder">
                                <i class="fas fa-image"></i>
                            </div>
                        `}
                        <div class="product-card-title">
                            <h4>${nombre}</h4>
                            <p>${descripcion}</p>
                        </div>
                    </div>
                    <button class="product-card-expand-btn" onclick="window.toggleProductCard('${cardId}')">
                        <span>Ver más información</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="product-card-body">
                        <div class="product-card-field">
                            <span class="product-card-label">Categoría</span>
                            <span class="product-card-value">${categoria}</span>
                        </div>
                        <div class="product-card-field">
                            <span class="product-card-label">Precio</span>
                            <span class="product-card-value price">
                                ${descuento > 0 && precioConDescuento ? `
                                    <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                                        <span style="text-decoration: line-through; color: #999; font-size: 0.85em;">
                                            $${precioOriginal.toFixed(2)}
                                        </span>
                                        <span style="color: #dc3545; font-weight: bold;">
                                            $${precioConDescuento.toFixed(2)}
                                        </span>
                                        <span style="background: #dc3545; color: white; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.7em; display: inline-block; width: fit-content;">
                                            -${descuento}%
                                        </span>
                                    </div>
                                ` : `
                                    $ ${precio.toFixed(2)}
                                `}
                            </span>
                        </div>
                        <div class="product-card-field">
                            <span class="product-card-label">Stock</span>
                            <span class="product-card-value">${stock} ${unidad}</span>
                        </div>
                        <div class="product-card-field">
                            <span class="product-card-label">Estado</span>
                            <span class="product-card-value"><span class="status-pill ${activo ? 'active' : 'paused'}">${statusLabel}</span></span>
                        </div>
                    </div>
                    <div class="product-card-footer">
                        <button class="action-pill action-edit" onclick="window.editProduct('${producto.id}')">Editar</button>
                        <button class="action-pill action-pause" onclick="window.pauseProduct('${producto.id}')">${pauseLabel}</button>
                        <button class="action-pill action-delete" onclick="window.deleteProduct('${producto.id}', '${nombre.replace(/'/g, "\\'")}')">Eliminar</button>
                    </div>
                </div>
            `;
        }).join('');

        // Insertar cards en el contenedor
        cardsContainer.innerHTML = cards;
        table.style.display = 'none';
        cardsContainer.style.display = 'block';
    } else {
        // Renderizar tabla en desktop
        const cardsContainer = document.getElementById('productsCardsContainer');
        if (cardsContainer) cardsContainer.style.display = 'none';
        table.style.display = 'block';

        const rows = productos.map((producto) => {
            const nombre = producto.nombre || 'Sin nombre';
            const descripcion = producto.descripcion || 'Sin descripción';
            const categoria = capitalizar(producto.categoria || 'Sin categoría');
            const unidad = capitalizar(producto.unidad || 'Sin unidad');
            const precioOriginal = Number(producto.precio) || 0;
            const descuento = Number(producto.descuento) || 0;
            const precioConDescuento = descuento > 0 && precioOriginal > 0 
                ? precioOriginal * (1 - descuento / 100) 
                : null;
            const precio = precioConDescuento || precioOriginal;
            const stock = Number(producto.stock) || 0;
            const imagenUrl = producto.imagenUrl || null;
            const activo = producto.activo !== false;
            const statusLabel = activo ? 'Activo' : 'Pausado';
            const pauseLabel = activo ? 'Pausar' : 'Reanudar';

            return `
                <tr>
                    <td>
                        <div class="product-info">
                            ${imagenUrl ? `
                                <img src="${imagenUrl}" alt="${nombre}" class="product-image">
                            ` : `
                                <div class="product-image placeholder">
                                    <i class="fas fa-image"></i>
                                </div>
                            `}
                            <div class="product-details">
                                <h4>${nombre}</h4>
                                <p>${descripcion.length > 60 ? descripcion.substring(0, 60) + '…' : descripcion}</p>
                            </div>
                        </div>
                    </td>
                    <td><span class="category-badge">${categoria}</span></td>
                    <td class="product-price">
                        ${descuento > 0 && precioConDescuento ? `
                            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                                <span style="text-decoration: line-through; color: #999; font-size: 0.85em;">
                                    $${precioOriginal.toFixed(2)}
                                </span>
                                <span style="color: #dc3545; font-weight: bold;">
                                    $${precioConDescuento.toFixed(2)}
                                </span>
                                <span style="background: #dc3545; color: white; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7em; display: inline-block; width: fit-content;">
                                    -${descuento}%
                                </span>
                            </div>
                        ` : `
                            $ ${precioOriginal.toFixed(2)}
                        `}
                    </td>
                    <td>${stock}</td>
                    <td>${unidad}</td>
                    <td><span class="status-pill ${activo ? 'active' : 'paused'}">${statusLabel}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-pill action-edit" onclick="window.editProduct('${producto.id}')">Editar</button>
                            <button class="action-pill action-pause" onclick="window.pauseProduct('${producto.id}')">${pauseLabel}</button>
                            <button class="action-pill action-delete" onclick="window.deleteProduct('${producto.id}', '${nombre.replace(/'/g, "\\'")}')">Eliminar</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        body.innerHTML = rows;
    }

    updatePagination(filteredProducts.length);
    hideStatus();
}

// Redimensionar cuando cambia el tamaño de la ventana
window.addEventListener('resize', () => {
    if (allProducts.length > 0) {
        renderProducts(getVisibleProducts());
    }
});

async function loadProducts(vendedorId) {
    try {
        setStatus('📦 Cargando productos...');

        const loader = document.getElementById('productsLoader');
        if (loader) loader.style.display = 'block';

        const consultas = [
            db.collection('productos').where('vendedor_id', '==', vendedorId),
            db.collection('productos').where('vendedorId', '==', vendedorId),
            db.collection('productos').where('uid', '==', vendedorId)
        ];

        let snapshot = null;
        for (let i = 0; i < consultas.length; i += 1) {
            snapshot = await consultas[i].get();
            if (!snapshot.empty) break;
        }

        if (!snapshot || snapshot.empty) {
            const todos = await db.collection('productos').limit(100).get();
            if (todos.empty) {
                allProducts = [];
                filteredProducts = [];
                renderProducts([]);
                setStatus('📭 No se encontraron productos', 'info');
                return;
            }
            snapshot = todos;
        }

        const productos = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.vendedor_id === vendedorId || data.vendedorId === vendedorId || data.uid === vendedorId) {
                productos.push({ id: doc.id, ...data });
            }
        });

        if (!productos.length) {
            allProducts = [];
            filteredProducts = [];
            setStatus('📭 No se encontraron productos del vendedor', 'info');
            renderProducts([]);
            return;
        }

        allProducts = await prepararProductos(productos);
        // Inicializar filteredProducts con todos los productos
        filteredProducts = [...allProducts];
        applyFilters(); // Aplicar filtros después de cargar
        setStatus(`✅ Productos cargados: ${allProducts.length}`, 'success');
    } catch (error) {
        console.error('Error al cargar productos:', error);
        setStatus('❌ Error al cargar productos: ' + error.message, 'error', false);
        mostrarMensaje('❌ Error al cargar productos: ' + error.message, 'error');
        const loader = document.getElementById('productsLoader');
        if (loader) loader.style.display = 'none';
    }
}

window.changePage = function changePage(delta) {
    const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
    const newPage = currentPage + delta;
    if (newPage < 1 || newPage > totalPages) {
        return;
    }
    currentPage = newPage;
    renderProducts(getVisibleProducts());
};

window.editProduct = function editProduct(productId) {
    window.location.href = `/vendedor/editar/${productId}`;
};

window.pauseProduct = async function pauseProduct(productId) {
    try {
        if (!db) {
            alert('Error: Base de datos no disponible');
            return;
        }

        if (!auth || !auth.currentUser) {
            alert('Error: Usuario no autenticado');
            return;
        }

        const docRef = db.collection('productos').doc(productId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            alert('Error: Producto no encontrado');
            return;
        }

        const data = doc.data();
        
        // Verificar que el producto pertenezca al vendedor actual
        const vendedorId = data.vendedor_id || data.vendedorId || data.uid || '';
        if (String(vendedorId) !== String(auth.currentUser.uid)) {
            alert('Error: No tienes permisos para modificar este producto. Solo puedes modificar tus propios productos.');
            return;
        }
        
        const estaActivo = data.activo !== false; // true si está activo, false si está pausado
        const nuevoEstado = !estaActivo; // Cambiar al estado opuesto

        // Confirmación antes de cambiar
        const mensajeConfirmacion = nuevoEstado 
            ? '¿Estás seguro de que quieres reactivar este producto?'
            : '¿Estás seguro de que quieres pausar este producto?';
        
        if (!confirm(mensajeConfirmacion)) {
            return;
        }

        setStatus('⏳ Actualizando estado del producto...', 'info');

        // Actualizar el estado del producto
        await docRef.update({
            activo: nuevoEstado,
            fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp()
        });

        setStatus(nuevoEstado ? '▶️ Producto reactivado' : '⏸️ Producto pausado', 'success');
        mostrarMensaje(nuevoEstado ? '✅ Producto reactivado correctamente' : '✅ Producto pausado correctamente', 'success');

        // Recargar productos para actualizar la vista
        await loadProducts(auth.currentUser.uid);
        
    } catch (error) {
        console.error('❌ Error al cambiar estado del producto:', error);
        console.error('❌ Código del error:', error.code);
        console.error('❌ Mensaje del error:', error.message);
        
        let mensajeError = 'Error al cambiar el estado del producto: ';
        if (error.code === 'permission-denied') {
            mensajeError += 'No tienes permisos para realizar esta acción.';
        } else if (error.message) {
            mensajeError += error.message;
        } else {
            mensajeError += 'Error desconocido. Por favor, intenta nuevamente.';
        }
        
        setStatus(mensajeError, 'error');
        mostrarMensaje(mensajeError, 'error');
    }
};

window.deleteProduct = async function deleteProduct(productId, productName) {
    if (!confirm(`¿Estás seguro de que quieres eliminar el producto "${productName}"?`)) {
        return;
    }

    try {
        setStatus('🗑️ Eliminando producto...');
        await db.collection('productos').doc(productId).delete();
        mostrarMensaje('✅ Producto eliminado correctamente', 'success');

        const user = auth.currentUser;
        if (user) {
            await loadProducts(user.uid);
        }
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        setStatus('❌ Error al eliminar producto: ' + error.message, 'error');
        mostrarMensaje('❌ Error al eliminar el producto', 'error');
    }
};

window.toggleProductCard = function toggleProductCard(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const isExpanded = card.classList.contains('expanded');
    const btn = card.querySelector('.product-card-expand-btn span');
    
    if (isExpanded) {
        card.classList.remove('expanded');
        if (btn) btn.textContent = 'Ver más información';
    } else {
        card.classList.add('expanded');
        if (btn) btn.textContent = 'Ver menos';
    }
};

// Funciones de filtros
function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilter = document.getElementById('categoryFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    // Búsqueda
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                activeFilters.search = e.target.value.trim();
                applyFilters();
            }, 300); // Debounce de 300ms
        });
    }
    
    // Filtro de categoría
    if (categoryFilter) {
        categoryFilter.addEventListener('click', () => {
            showCategoryFilter();
        });
    }
    
    // Filtro de estado
    if (statusFilter) {
        statusFilter.addEventListener('click', () => {
            showStatusFilter();
        });
    }
}

function showCategoryFilter() {
    // Obtener todas las categorías únicas
    const categorias = [...new Set(allProducts.map(p => capitalizar(p.categoria || 'Sin categoría')))].sort();
    
    // Crear modal/dropdown
    const modal = document.createElement('div');
    modal.className = 'filter-modal';
    modal.innerHTML = `
        <div class="filter-modal-content">
            <div class="filter-modal-header">
                <h3>Filtrar por categoría</h3>
                <button class="filter-modal-close" onclick="this.closest('.filter-modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="filter-modal-body">
                <button class="filter-option ${activeFilters.category === null ? 'active' : ''}" 
                        onclick="window.selectCategory(null)">
                    Todas las categorías
                </button>
                ${categorias.map(cat => `
                    <button class="filter-option ${activeFilters.category === cat ? 'active' : ''}" 
                            onclick="window.selectCategory('${cat}')">
                        ${cat}
                    </button>
                `).join('')}
            </div>
        </div>
        <div class="filter-modal-overlay" onclick="this.closest('.filter-modal').remove()"></div>
    `;
    document.body.appendChild(modal);
}

function showStatusFilter() {
    const modal = document.createElement('div');
    modal.className = 'filter-modal';
    modal.innerHTML = `
        <div class="filter-modal-content">
            <div class="filter-modal-header">
                <h3>Filtrar por estado</h3>
                <button class="filter-modal-close" onclick="this.closest('.filter-modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="filter-modal-body">
                <button class="filter-option ${activeFilters.status === null ? 'active' : ''}" 
                        onclick="window.selectStatus(null)">
                    Todos los estados
                </button>
                <button class="filter-option ${activeFilters.status === 'activo' ? 'active' : ''}" 
                        onclick="window.selectStatus('activo')">
                    Activos
                </button>
                <button class="filter-option ${activeFilters.status === 'pausado' ? 'active' : ''}" 
                        onclick="window.selectStatus('pausado')">
                    Pausados
                </button>
            </div>
        </div>
        <div class="filter-modal-overlay" onclick="this.closest('.filter-modal').remove()"></div>
    `;
    document.body.appendChild(modal);
}

window.selectCategory = function selectCategory(category) {
    activeFilters.category = category;
    applyFilters();
    updateFilterButtons();
    document.querySelectorAll('.filter-modal').forEach(m => m.remove());
}

window.selectStatus = function selectStatus(status) {
    activeFilters.status = status;
    applyFilters();
    updateFilterButtons();
    document.querySelectorAll('.filter-modal').forEach(m => m.remove());
}

window.clearFilters = function clearFilters() {
    activeFilters.search = '';
    activeFilters.category = null;
    activeFilters.status = null;
    
    // Limpiar input de búsqueda
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    // Actualizar botones
    updateFilterButtons();
    
    // Aplicar filtros (que ahora no tienen restricciones)
    applyFilters();
}

function updateFilterButtons() {
    const categoryFilter = document.getElementById('categoryFilter');
    const statusFilter = document.getElementById('statusFilter');
    
    if (categoryFilter) {
        if (activeFilters.category) {
            categoryFilter.innerHTML = `<i class="fas fa-filter"></i> ${activeFilters.category}`;
            categoryFilter.style.background = '#e6f5e1';
            categoryFilter.style.borderColor = '#2f7a32';
            categoryFilter.style.color = '#2f7a32';
        } else {
            categoryFilter.innerHTML = `<i class="fas fa-filter"></i> Categoría`;
            categoryFilter.style.background = '';
            categoryFilter.style.borderColor = '';
            categoryFilter.style.color = '';
        }
    }
    
    if (statusFilter) {
        if (activeFilters.status) {
            const statusText = activeFilters.status === 'activo' ? 'Activos' : 'Pausados';
            statusFilter.innerHTML = `<i class="fas fa-toggle-on"></i> ${statusText}`;
            statusFilter.style.background = '#e6f5e1';
            statusFilter.style.borderColor = '#2f7a32';
            statusFilter.style.color = '#2f7a32';
        } else {
            statusFilter.innerHTML = `<i class="fas fa-toggle-on"></i> Estado`;
            statusFilter.style.background = '';
            statusFilter.style.borderColor = '';
            statusFilter.style.color = '';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupFilters(); // Configurar filtros al cargar
    
    ensureFirebase().then(({ auth: authInstance, db: dbInstance, storage: storageInstance }) => {
        auth = authInstance;
        db = dbInstance;
        storage = storageInstance;

        auth.onAuthStateChanged((user) => {
            if (!user) {
                setStatus('❌ Usuario no autenticado. Redirigiendo...', 'error', false);
                setTimeout(() => {
                    window.location.href = '/auth/login';
                }, 1500);
                return;
            }

            actualizarSaludoUsuario(user);
            setStatus('✅ Usuario autenticado: ' + (user.email || 'Sin correo'));
            loadProducts(user.uid);
        });
    }).catch((error) => {
        console.error('Error inicializando Firebase:', error);
        setStatus('❌ Error de conexión. Recarga la página.', 'error', false);
        mostrarMensaje('❌ Error de conexión. Recarga la página.', 'error');
    });
});

})();


