// ===========================================
// JAVASCRIPT PARA DETALLE DE PRODUCTO
// ===========================================

// Variables globales
let db;
let auth;
let productoData = null;
let productoId = null;
let currentRating = 0;
let imagenes = [];

// Inicializar Firebase
async function inicializarFirebase() {
    try {
        console.log('🔄 Inicializando Firebase...');
        
        // Esperar a que Firebase esté disponible
        let intentos = 0;
        const maxIntentos = 30; // Aumentado a 30 intentos (7.5 segundos)
        
        while (typeof firebase === 'undefined' && intentos < maxIntentos) {
            await new Promise(resolve => setTimeout(resolve, 250));
            intentos++;
        }
        
        if (typeof firebase === 'undefined') {
            console.error('❌ Firebase SDK no se cargó después de', maxIntentos, 'intentos');
            throw new Error('Firebase SDK no se cargó');
        }
        
        console.log('✅ Firebase SDK disponible');
        
        if (!window.firebaseConfig) {
            console.error('❌ Configuración de Firebase no disponible en window.firebaseConfig');
            throw new Error('Configuración de Firebase no disponible');
        }
        
        console.log('✅ Configuración de Firebase encontrada');
        
        // Inicializar Firebase si no está inicializado
        if (firebase.apps.length === 0) {
            console.log('🔄 Inicializando nueva instancia de Firebase...');
            firebase.initializeApp(window.firebaseConfig);
            console.log('✅ Firebase app inicializada');
        } else {
            console.log('✅ Firebase ya estaba inicializado');
        }
        
        auth = firebase.auth();
        db = firebase.firestore();
        
        console.log('✅ Auth y Firestore obtenidos');
        
        // Configurar settings PRIMERO (antes de enablePersistence)
        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
            ignoreUndefinedProperties: true
        });
        
        console.log('✅ Settings de Firestore configurados');
        
        // Intentar habilitar persistencia (no es crítico si falla)
        try {
            await db.enablePersistence({
                synchronizeTabs: true
            }).catch(err => {
                if (err.code === 'failed-precondition') {
                    console.warn('⚠️ Persistencia solo disponible en una pestaña');
                } else if (err.code === 'unimplemented') {
                    console.warn('⚠️ Persistencia no disponible en este navegador');
                } else {
                    console.warn('⚠️ Error habilitando persistencia:', err.code, err.message);
                }
            });
            console.log('✅ Persistencia configurada (o ignorada si no está disponible)');
        } catch (error) {
            // Ignorar errores de persistencia, no es crítico
            console.warn('⚠️ No se pudo habilitar persistencia:', error.message);
        }
        
        // Verificar que db esté funcionando con una prueba simple
        try {
            await db.collection('_test_connection').limit(0).get();
            console.log('✅ Conexión a Firestore verificada');
        } catch (testError) {
            console.warn('⚠️ Advertencia al verificar conexión:', testError.message);
            // No fallar aquí, podría ser un problema de permisos pero la conexión funciona
        }
        
        console.log('✅ Firebase completamente inicializado');
        return true;
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
        console.error('❌ Stack:', error.stack);
        return false;
    }
}

// Obtener ID del producto desde la URL o data attribute
function obtenerProductoId() {
    const main = document.querySelector('main[data-product-id]');
    if (main && main.dataset.productId) {
        return main.dataset.productId;
    }
    
    const pathParts = window.location.pathname.split('/');
    return pathParts[pathParts.length - 1];
}

// Cargar datos del producto
async function cargarProducto() {
    try {
        productoId = obtenerProductoId();
        console.log('📦 Cargando producto:', productoId);
        
        if (!db) {
            console.error('❌ db no está disponible');
            throw new Error('Base de datos no disponible');
        }
        
        console.log('✅ db disponible, procediendo a cargar producto...');
        
        const productoDoc = await db.collection('productos').doc(productoId).get();
        
        if (!productoDoc.exists) {
            throw new Error('Producto no encontrado');
        }
        
        productoData = { id: productoDoc.id, ...productoDoc.data() };
        console.log('✅ Producto cargado:', productoData);
        console.log('🔍 vendedor_id del producto:', productoData.vendedor_id);
        
        // Cargar imágenes (si hay múltiples)
        imagenes = [];
        if (productoData.imagen) {
            imagenes.push(productoData.imagen);
        }
        // Si hay más imágenes en un array
        if (productoData.imagenes && Array.isArray(productoData.imagenes)) {
            imagenes = [...imagenes, ...productoData.imagenes];
        }
        // Eliminar duplicados
        imagenes = [...new Set(imagenes.filter(img => img && img.trim() !== ''))];
        
        if (imagenes.length === 0) {
            // Usar un placeholder SVG en base64 en lugar de una imagen que no existe
            imagenes.push('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y4ZjlmYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==');
        }
        
        mostrarProducto();
        
        // Ocultar loading y mostrar contenido PRIMERO para que el usuario vea la página
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('productContent').style.display = 'block';
        
        // Cargar información adicional en paralelo (sin bloquear la UI)
        Promise.all([
            cargarInformacionVendedor(),
            cargarComentarios()
        ]).catch(error => {
            console.error('Error cargando información adicional:', error);
        });
        
    } catch (error) {
        console.error('❌ Error cargando producto:', error);
        mostrarError(error.message);
    }
}

// Mostrar datos del producto en la UI
function mostrarProducto() {
    if (!productoData) return;
    
    // Título
    document.getElementById('productTitle').textContent = productoData.nombre || 'Sin nombre';
    document.getElementById('breadcrumb-product').textContent = productoData.nombre || 'Producto';
    
    // Categoría
    const categoria = productoData.categoria || 'otros';
    document.getElementById('productCategory').textContent = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    document.getElementById('breadcrumb-category').textContent = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    
    // Precio
    const precio = productoData.precio || 0;
    document.getElementById('productPrice').textContent = `$${precio.toFixed(2)} MXN`;
    
    // Stock
    const stock = productoData.stock || 0;
    const unidad = productoData.unidad || 'kg';
    document.getElementById('productStock').textContent = stock;
    document.getElementById('productUnit').textContent = unidad;
    document.getElementById('stockInfo').textContent = `Disponible: ${stock} ${unidad}`;
    
    // Descripción
    document.getElementById('productDescription').textContent = productoData.descripcion || 'Sin descripción disponible.';
    
    // Actualizar cantidad máxima
    const quantityInput = document.getElementById('quantity');
    quantityInput.setAttribute('max', stock);
    quantityInput.value = Math.min(parseInt(quantityInput.value) || 1, stock);
    
    // Galería de imágenes
    mostrarGalería();
    
    // Actualizar estado de botones
    actualizarEstadoBotones();
    
    // Verificar stock disponible considerando lo que está en el carrito
    if (auth && auth.currentUser && db) {
        verificarStockDisponible().catch(error => {
            console.warn('⚠️ Error verificando stock disponible inicial:', error);
        });
    }
}

// Mostrar galería de imágenes
function mostrarGalería() {
    if (imagenes.length === 0) return;
    
    const mainImage = document.getElementById('mainImage');
    mainImage.src = imagenes[0];
    mainImage.alt = productoData.nombre || 'Producto';
    
    // Thumbnails
    const thumbnailGallery = document.getElementById('thumbnailGallery');
    
    if (imagenes.length > 1) {
        const placeholderSVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y4ZjlmYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';
        thumbnailGallery.innerHTML = imagenes.map((img, index) => `
            <div class="thumbnail-item ${index === 0 ? 'active' : ''}" data-index="${index}">
                <img src="${img}" alt="Vista ${index + 1}" onerror="this.src='${placeholderSVG}'">
            </div>
        `).join('');
        
        // Event listeners para thumbnails
        thumbnailGallery.querySelectorAll('.thumbnail-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                cambiarImagenPrincipal(index);
                
                // Actualizar active
                thumbnailGallery.querySelectorAll('.thumbnail-item').forEach(thumb => {
                    thumb.classList.remove('active');
                });
                this.classList.add('active');
            });
        });
    } else {
        thumbnailGallery.innerHTML = '';
    }
}

// Cambiar imagen principal
function cambiarImagenPrincipal(index) {
    if (index >= 0 && index < imagenes.length) {
        document.getElementById('mainImage').src = imagenes[index];
    }
}

// Cargar información del vendedor
async function cargarInformacionVendedor() {
    try {
        console.log('👤 cargarInformacionVendedor - Iniciando...');
        
        // Verificar que db esté inicializado
        if (!db) {
            console.error('❌ Firestore no está disponible');
            // Intentar obtener db desde window si está disponible
            if (window.db) {
                db = window.db;
                console.log('✅ Usando db desde window');
            } else {
                console.error('❌ No se pudo obtener db');
                return;
            }
        }
        
        if (!productoData || !productoData.vendedor_id) {
            console.log('⚠️ No hay vendedor_id en el producto');
            console.log('📦 productoData:', productoData);
            return;
        }
        
        console.log('👤 Buscando vendedor con ID:', productoData.vendedor_id);
        
        const vendedorDoc = await db.collection('usuarios').doc(productoData.vendedor_id).get();
        
        if (vendedorDoc.exists) {
            const vendedorData = vendedorDoc.data();
            console.log('✅ Datos del vendedor cargados:', vendedorData);
            
            // Nombre del vendedor
            const nombreVendedor = vendedorData.nombre || productoData.vendedor_nombre || 'Vendedor';
            document.getElementById('sellerName').textContent = nombreVendedor;
            
            // Email
            document.getElementById('sellerEmail').textContent = vendedorData.email || productoData.vendedor_email || 'No disponible';
            
            // Avatar inicial
            const avatar = document.getElementById('sellerAvatar');
            if (nombreVendedor) {
                avatar.textContent = nombreVendedor.charAt(0).toUpperCase();
            }
            
            // Ubicación - hacer clickeable para Google Maps
            const sellerLocationEl = document.getElementById('sellerLocation');
            
            // Limpiar evento anterior si existe
            const newLocationEl = sellerLocationEl.cloneNode(true);
            sellerLocationEl.parentNode.replaceChild(newLocationEl, sellerLocationEl);
            
            if (vendedorData.ubicacion || vendedorData.ubicacion_formatted) {
                const ubicacionTexto = vendedorData.ubicacion_formatted || vendedorData.ubicacion;
                newLocationEl.textContent = ubicacionTexto;
                
                // Guardar coordenadas para usar en Google Maps
                newLocationEl.dataset.lat = vendedorData.ubicacion_lat || '';
                newLocationEl.dataset.lng = vendedorData.ubicacion_lng || '';
                newLocationEl.dataset.formatted = ubicacionTexto;
                
                // Hacer clickeable con estilos y funcionalidad
                newLocationEl.classList.add('clickeable');
                newLocationEl.title = 'Click para ver en Google Maps';
                newLocationEl.style.cursor = 'pointer';
                
                // Event listener para abrir Google Maps
                newLocationEl.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    abrirGoogleMaps(
                        this.dataset.lat,
                        this.dataset.lng,
                        this.dataset.formatted
                    );
                });
            } else {
                newLocationEl.textContent = 'Ubicación no disponible';
                newLocationEl.classList.remove('clickeable');
                newLocationEl.removeAttribute('title');
                newLocationEl.style.cursor = 'default';
            }
            
            // Fecha de registro
            if (vendedorData.fecha_registro) {
                const fecha = new Date(vendedorData.fecha_registro.toDate());
                document.getElementById('sellerSince').textContent = fecha.getFullYear();
            }
            
            // Contar productos del vendedor (con límite para mejorar rendimiento)
            const productosSnapshot = await db.collection('productos')
                .where('vendedor_id', '==', productoData.vendedor_id)
                .where('activo', '==', true)
                .limit(100) // Limitar consulta para mejor rendimiento
                .get();
            document.getElementById('sellerProducts').textContent = productosSnapshot.size;
            
        } else {
            console.warn('⚠️ Vendedor no encontrado en Firestore, usando datos del producto como fallback');
            // Usar datos del producto como fallback
            document.getElementById('sellerName').textContent = productoData.vendedor_nombre || 'Vendedor';
        }
        
    } catch (error) {
        console.error('❌ Error cargando información del vendedor:', error);
        console.error('❌ Stack:', error.stack);
        // Mostrar mensaje de error en la UI
        const sellerName = document.getElementById('sellerName');
        if (sellerName) {
            sellerName.textContent = productoData.vendedor_nombre || 'Vendedor no disponible';
        }
    }
}

// Cargar comentarios
async function cargarComentarios() {
    try {
        if (!productoId) {
            console.warn('⚠️ No hay productoId para cargar comentarios');
            return;
        }
        
        if (!db) {
            console.warn('⚠️ Base de datos no disponible');
            return;
        }
        
        console.log('📝 Cargando comentarios para producto:', productoId);
        
        // Consultar comentarios del producto (con límite para mejorar rendimiento)
        let comentariosSnapshot;
        try {
            comentariosSnapshot = await db.collection('comentarios')
            .where('producto_id', '==', productoId)
            .where('activo', '==', true)
            .orderBy('fecha', 'desc')
                .limit(50) // Limitar a 50 comentarios más recientes
            .get();
        } catch (orderByError) {
            // Si falla orderBy, intentar sin orden
            console.warn('⚠️ Error con orderBy, cargando sin orden:', orderByError);
            comentariosSnapshot = await db.collection('comentarios')
                .where('producto_id', '==', productoId)
                .where('activo', '==', true)
                .limit(50) // Limitar a 50 comentarios
                .get();
        }
        
        const comentarios = [];
        comentariosSnapshot.forEach(doc => {
            const data = doc.data();
            comentarios.push({ 
                id: doc.id, 
                nombre_usuario: data.nombre_usuario || 'Usuario',
                texto: data.texto || '',
                calificacion: data.calificacion || 0,
                fecha: data.fecha,
                producto_id: data.producto_id,
                usuario_id: data.usuario_id
            });
        });
        
        // Ordenar manualmente si no se pudo ordenar en la consulta
        if (comentarios.length > 0 && comentarios[0].fecha) {
            comentarios.sort((a, b) => {
                const fechaA = a.fecha?.toDate ? a.fecha.toDate().getTime() : 0;
                const fechaB = b.fecha?.toDate ? b.fecha.toDate().getTime() : 0;
                return fechaB - fechaA; // Más recientes primero
            });
        }
        
        console.log(`✅ ${comentarios.length} comentarios cargados`);
        
        // Actualizar resumen de calificaciones
        actualizarResumenCalificaciones(comentarios);
        
        // Guardar comentarios para ordenamiento
        window.comentariosGlobales = comentarios;
        
        mostrarComentarios(comentarios);
        
        // Verificar si el usuario puede comentar
        verificarPermisoComentar();
        
    } catch (error) {
        console.error('❌ Error cargando comentarios:', error);
        // Mostrar mensaje de error en la UI
        const commentsList = document.getElementById('commentsList');
        if (commentsList) {
            commentsList.innerHTML = `
                <div class="no-comments">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar los comentarios. Por favor, recarga la página.</p>
                </div>
            `;
        }
    }
}

// Actualizar resumen de calificaciones
function actualizarResumenCalificaciones(comentarios) {
    const ratingSummary = document.getElementById('ratingSummary');
    if (!ratingSummary) return;
    
    if (comentarios.length === 0) {
        ratingSummary.style.display = 'none';
        return;
    }
    
    ratingSummary.style.display = 'block';
    
    // Calcular promedio
    let sumaCalificaciones = 0;
    let totalCalificaciones = comentarios.length;
    const distribucion = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    
    comentarios.forEach(comentario => {
        const calificacion = comentario.calificacion || 0;
        sumaCalificaciones += calificacion;
        if (calificacion >= 1 && calificacion <= 5) {
            distribucion[calificacion]++;
        }
    });
    
    const promedio = totalCalificaciones > 0 ? (sumaCalificaciones / totalCalificaciones).toFixed(1) : '0.0';
    
    // Actualizar promedio
    document.getElementById('ratingAverage').textContent = promedio;
    
    // Actualizar estrellas grandes
    const ratingStarsLarge = document.getElementById('ratingStarsLarge');
    const promedioNum = parseFloat(promedio);
    const estrellasLlenas = Math.floor(promedioNum);
    const tieneMedia = (promedioNum - estrellasLlenas) >= 0.5;
    
    let estrellasHTML = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= estrellasLlenas) {
            estrellasHTML += '<i class="fas fa-star"></i>';
        } else if (i === estrellasLlenas + 1 && tieneMedia) {
            estrellasHTML += '<i class="fas fa-star-half-alt"></i>';
        } else {
            estrellasHTML += '<i class="far fa-star"></i>';
        }
    }
    ratingStarsLarge.innerHTML = estrellasHTML;
    
    // Actualizar total de calificaciones
    document.getElementById('totalRatings').textContent = `${totalCalificaciones} ${totalCalificaciones === 1 ? 'calificación' : 'calificaciones'}`;
    
        // Actualizar distribución (usando las clases compact para el nuevo diseño)
    for (let i = 5; i >= 1; i--) {
        const count = distribucion[i] || 0;
        const porcentaje = totalCalificaciones > 0 ? ((count / totalCalificaciones) * 100).toFixed(0) : 0;
        
        // Intentar primero con las clases compact (nuevo diseño)
        let item = document.querySelector(`.distribution-item-compact[data-rating="${i}"]`);
        let fill, percent;
        
        if (item) {
            fill = item.querySelector('.distribution-fill-compact');
            percent = item.querySelector('.distribution-percent-compact');
        } else {
            // Fallback a las clases originales por si acaso
            item = document.querySelector(`.distribution-item[data-rating="${i}"]`);
            if (item) {
                fill = item.querySelector('.distribution-fill');
                percent = item.querySelector('.distribution-percent');
            }
        }
        
        if (fill) {
            fill.style.width = `${porcentaje}%`;
            fill.setAttribute('data-fill', porcentaje);
        }
        if (percent) {
            percent.textContent = `${porcentaje}%`;
            percent.setAttribute('data-percent', porcentaje);
        }
    }
}

// Ordenar comentarios
function ordenarComentarios(comentarios, orden) {
    const comentariosOrdenados = [...comentarios];
    
    switch(orden) {
        case 'recientes':
            comentariosOrdenados.sort((a, b) => {
                const fechaA = a.fecha?.toDate ? a.fecha.toDate().getTime() : 0;
                const fechaB = b.fecha?.toDate ? b.fecha.toDate().getTime() : 0;
                return fechaB - fechaA;
            });
            break;
        case 'antiguos':
            comentariosOrdenados.sort((a, b) => {
                const fechaA = a.fecha?.toDate ? a.fecha.toDate().getTime() : 0;
                const fechaB = b.fecha?.toDate ? b.fecha.toDate().getTime() : 0;
                return fechaA - fechaB;
            });
            break;
        case 'mejores':
            comentariosOrdenados.sort((a, b) => {
                const calA = a.calificacion || 0;
                const calB = b.calificacion || 0;
                if (calB !== calA) return calB - calA;
                // Si tienen la misma calificación, ordenar por fecha
                const fechaA = a.fecha?.toDate ? a.fecha.toDate().getTime() : 0;
                const fechaB = b.fecha?.toDate ? b.fecha.toDate().getTime() : 0;
                return fechaB - fechaA;
            });
            break;
        case 'peores':
            comentariosOrdenados.sort((a, b) => {
                const calA = a.calificacion || 0;
                const calB = b.calificacion || 0;
                if (calA !== calB) return calA - calB;
                // Si tienen la misma calificación, ordenar por fecha
                const fechaA = a.fecha?.toDate ? a.fecha.toDate().getTime() : 0;
                const fechaB = b.fecha?.toDate ? b.fecha.toDate().getTime() : 0;
                return fechaB - fechaA;
            });
            break;
    }
    
    return comentariosOrdenados;
}

// Mostrar comentarios en la UI
function mostrarComentarios(comentarios) {
    const commentsList = document.getElementById('commentsList');
    const commentsCount = document.getElementById('commentsCount');
    
    if (!commentsList || !commentsCount) {
        console.error('❌ Elementos de comentarios no encontrados en el DOM');
        return;
    }
    
    commentsCount.textContent = comentarios.length;
    
    if (comentarios.length === 0) {
        commentsList.innerHTML = `
            <div class="no-comments">
                <i class="fas fa-comment-slash"></i>
                <p>Aún no hay comentarios. Sé el primero en opinar.</p>
            </div>
        `;
        return;
    }
    
    commentsList.innerHTML = comentarios.map(comentario => {
        // Formatear fecha
        let fecha = 'Fecha no disponible';
        try {
            if (comentario.fecha) {
                const fechaObj = comentario.fecha.toDate ? comentario.fecha.toDate() : new Date(comentario.fecha);
                fecha = fechaObj.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (error) {
            console.warn('Error formateando fecha:', error);
        }
        
        // Generar estrellas para la calificación
        const calificacion = comentario.calificacion || 0;
        const estrellasLlenas = '★'.repeat(calificacion);
        const estrellasVacias = '☆'.repeat(5 - calificacion);
        const estrellas = estrellasLlenas + estrellasVacias;
        
        // Escapar HTML para seguridad
        const nombre = (comentario.nombre_usuario || 'Usuario').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const texto = (comentario.texto || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return `
            <div class="comment-item">
                <div class="comment-header">
                    <div class="comment-author-info">
                        <span class="comment-author">
                            <i class="fas fa-user"></i>
                            ${nombre}
                        </span>
                        <span class="comment-calificacion-numero">${calificacion}/5</span>
                </div>
                    <span class="comment-date">
                        <i class="fas fa-clock"></i>
                        ${fecha}
                    </span>
                </div>
                <div class="comment-rating" title="Calificación: ${calificacion} de 5 estrellas">
                    ${estrellas}
                </div>
                <div class="comment-text">${texto}</div>
            </div>
        `;
    }).join('');
    
    console.log(`✅ ${comentarios.length} comentarios mostrados en la UI`);
}

// Verificar si el usuario puede comentar
async function verificarPermisoComentar() {
    try {
        const btnMostrar = document.getElementById('btn-mostrar-comentario');
        const cancelBtn = document.getElementById('cancelCommentBtn');
        
        // Siempre mostrar el botón - los usuarios pueden comentar las veces que quieran
        if (btnMostrar) {
            btnMostrar.style.display = 'inline-flex';
        }
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-flex';
        }
    } catch (error) {
        console.error('❌ Error verificando permiso:', error);
        // En caso de error, mostrar el botón de todos modos
        const btnMostrar = document.getElementById('btn-mostrar-comentario');
        if (btnMostrar) {
            btnMostrar.style.display = 'inline-flex';
        }
    }
}

// Mostrar formulario de comentarios
function mostrarFormularioComentario() {
    const user = auth.currentUser;
    if (!user) {
        mostrarNotificacion('Debes iniciar sesión para comentar', 'error');
        return;
    }
    
    const commentForm = document.getElementById('commentForm');
    const btnMostrar = document.getElementById('btn-mostrar-comentario');
    
    if (commentForm) {
        commentForm.style.display = 'block';
    }
    if (btnMostrar) {
        btnMostrar.style.display = 'none';
    }
}

// Ocultar formulario de comentarios
function ocultarFormularioComentario() {
    const commentForm = document.getElementById('commentForm');
    const btnMostrar = document.getElementById('btn-mostrar-comentario');
    const commentText = document.getElementById('commentText');
    const cancelBtn = document.getElementById('cancelCommentBtn');
    
    if (commentForm) {
        commentForm.style.display = 'none';
    }
    if (btnMostrar) {
        btnMostrar.style.display = 'inline-flex';
    }
    if (commentText) {
        commentText.value = '';
    }
    // Resetear rating
    currentRating = 0;
    resaltarEstrellas(0);
}

// Inicializar sistema de rating
function inicializarRating() {
    const stars = document.querySelectorAll('#ratingInput .fa-star');
    stars.forEach((star, index) => {
        star.addEventListener('mouseenter', function() {
            resaltarEstrellas(index + 1);
        });
        
        star.addEventListener('click', function() {
            currentRating = index + 1;
            resaltarEstrellas(currentRating);
        });
    });
    
    document.getElementById('ratingInput').addEventListener('mouseleave', function() {
        resaltarEstrellas(currentRating);
    });
}

// Resaltar estrellas
function resaltarEstrellas(rating) {
    const stars = document.querySelectorAll('#ratingInput .fa-star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

// Publicar comentario
async function publicarComentario() {
    try {
        const user = auth.currentUser;
        if (!user) {
            mostrarNotificacion('❌ Debes iniciar sesión para comentar', 'error');
            return;
        }
        
        if (currentRating === 0) {
            mostrarNotificacion('❌ Por favor selecciona una calificación', 'error');
            return;
        }
        
        const texto = document.getElementById('commentText').value.trim();
        if (!texto) {
            mostrarNotificacion('❌ Por favor escribe un comentario', 'error');
            return;
        }
        
        // Obtener nombre del usuario
        let nombreUsuario = 'Usuario';
        try {
        const userDoc = await db.collection('usuarios').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                nombreUsuario = userData.nombre || userData.nombre_tienda || user.displayName || user.email.split('@')[0] || 'Usuario';
            } else {
                nombreUsuario = user.displayName || user.email.split('@')[0] || 'Usuario';
            }
        } catch (error) {
            console.warn('⚠️ Error obteniendo nombre del usuario:', error);
            nombreUsuario = user.displayName || user.email.split('@')[0] || 'Usuario';
        }
        
        // Crear comentario para guardar en Firestore
        const comentario = {
            producto_id: productoId,
            usuario_id: user.uid,
            nombre_usuario: nombreUsuario,
            texto: texto.trim(),
            calificacion: currentRating,
            fecha: firebase.firestore.FieldValue.serverTimestamp(),
            activo: true
        };
        
        console.log('💾 Guardando comentario en Firestore:', {
            producto_id: productoId,
            nombre_usuario: nombreUsuario,
            calificacion: currentRating,
            texto_length: texto.trim().length
        });
        
        // Guardar en Firestore
        await db.collection('comentarios').add(comentario);
        
        console.log('✅ Comentario guardado exitosamente en Firestore');
        
        mostrarNotificacion('✅ Comentario publicado exitosamente', 'success');
        
        // Limpiar y ocultar formulario
        ocultarFormularioComentario();
        
        // Actualizar comentarios globales y recargar
        await cargarComentarios();
        
    } catch (error) {
        console.error('❌ Error publicando comentario:', error);
        mostrarNotificacion('❌ Error al publicar comentario', 'error');
    }
}

// Actualizar estado de botones de cantidad
function actualizarEstadoBotones() {
    const quantityInput = document.getElementById('quantity');
    const decreaseBtn = document.getElementById('decreaseBtn');
    const increaseBtn = document.getElementById('increaseBtn');
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');
    
    // Obtener stock actualizado de productoData (o del atributo max si está actualizado)
    const stock = productoData ? (productoData.stock || 0) : (parseInt(quantityInput.getAttribute('max')) || 0);
    const currentValue = parseInt(quantityInput.value) || 1;
    
    // Actualizar límite máximo del input
    quantityInput.setAttribute('max', stock);
    
    // Asegurar que el valor no exceda el stock
    if (currentValue > stock) {
        quantityInput.value = stock > 0 ? stock : 1;
    }
    if (currentValue < 1) {
        quantityInput.value = 1;
    }
    
    decreaseBtn.disabled = parseInt(quantityInput.value) <= 1;
    increaseBtn.disabled = parseInt(quantityInput.value) >= stock;
    
    // Deshabilitar botones si no hay stock
    const hayStock = stock > 0;
    if (addToCartBtn) addToCartBtn.disabled = !hayStock;
    if (buyNowBtn) buyNowBtn.disabled = !hayStock;
}

// Actualizar UI del stock (mostrar stock disponible considerando lo que está en carrito)
async function actualizarStockUI(stockTotal, unidad, cantidadEnCarrito = 0) {
    const stockDisponible = Math.max(0, stockTotal - cantidadEnCarrito);
    
    // Actualizar productoData local
    if (productoData) {
        productoData.stock = stockTotal;
    }
    
    // Actualizar elementos de la UI
    const stockElement = document.getElementById('productStock');
    const stockInfoElement = document.getElementById('stockInfo');
    const quantityInput = document.getElementById('quantity');
    
    if (stockElement) {
        stockElement.textContent = stockTotal;
    }
    
    if (stockInfoElement) {
        if (cantidadEnCarrito > 0) {
            stockInfoElement.textContent = `Disponible: ${stockDisponible} ${unidad} (${stockTotal} total, ${cantidadEnCarrito} en tu carrito)`;
        } else {
            stockInfoElement.textContent = `Disponible: ${stockTotal} ${unidad}`;
        }
    }
    
    if (quantityInput) {
        quantityInput.setAttribute('max', stockDisponible);
        const currentValue = parseInt(quantityInput.value) || 1;
        if (currentValue > stockDisponible) {
            quantityInput.value = stockDisponible > 0 ? stockDisponible : 1;
        }
    }
    
    // Actualizar estado de botones
    actualizarEstadoBotones();
}

// Agregar al carrito
async function agregarAlCarrito() {
    try {
        const user = auth.currentUser;
        if (!user) {
            mostrarNotificacion('❌ Debes iniciar sesión para agregar al carrito', 'error');
            return;
        }
        
        const quantity = parseInt(document.getElementById('quantity').value);
        
        // Obtener stock ACTUAL de Firestore (no usar el cacheado)
        const productoDocActual = await db.collection('productos').doc(productoId).get();
        if (!productoDocActual.exists) {
            mostrarNotificacion('❌ Producto no encontrado', 'error');
            return;
        }
        
        const productoDataActual = productoDocActual.data();
        const stockActual = productoDataActual.stock || 0;
        
        if (quantity < 1) {
            mostrarNotificacion('❌ La cantidad debe ser mayor a cero', 'error');
            return;
        }
        
        if (quantity > stockActual) {
            mostrarNotificacion(`❌ No hay suficiente stock disponible. Stock actual: ${stockActual} ${productoDataActual.unidad || 'kg'}`, 'error');
            // Actualizar UI con stock actual
            actualizarStockUI(stockActual, productoDataActual.unidad || 'kg');
            return;
        }
        
        // Verificar si ya existe en el carrito
        const carritoSnapshot = await db.collection('carrito')
            .where('usuario_id', '==', user.uid)
            .where('producto_id', '==', productoId)
            .get();
        
        if (!carritoSnapshot.empty) {
            // Actualizar cantidad
            const item = carritoSnapshot.docs[0];
            const cantidadEnCarrito = item.data().cantidad || 0;
            const nuevaCantidad = cantidadEnCarrito + quantity;
            
            if (nuevaCantidad > stockActual) {
                mostrarNotificacion(`❌ No hay suficiente stock disponible. Stock actual: ${stockActual} ${productoDataActual.unidad || 'kg'}. Ya tienes ${cantidadEnCarrito} en el carrito.`, 'error');
                // Actualizar UI con stock actual
                actualizarStockUI(stockActual, productoDataActual.unidad || 'kg');
                return;
            }
            
            await db.collection('carrito').doc(item.id).update({
                cantidad: nuevaCantidad,
                fecha_agregado: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            mostrarNotificacion(`✅ ${quantity} más agregado al carrito`, 'success');
            
            // Actualizar stock disponible mostrado (considerando lo que está en carrito)
            const stockDisponible = stockActual - nuevaCantidad;
            actualizarStockUI(stockActual, productoDataActual.unidad || 'kg', nuevaCantidad);
        } else {
            // Crear nuevo item
            const vendedorId = productoDataActual.vendedor_id || productoDataActual.vendedorId || '';
            console.log('🛒 Agregando al carrito:', {
                producto_nombre: productoDataActual.nombre,
                vendedor_id: vendedorId,
                stock_actual: stockActual
            });
            
            const itemCarrito = {
                producto_id: productoId,
                nombre: productoDataActual.nombre,
                precio: productoDataActual.precio,
                cantidad: quantity,
                unidad: productoDataActual.unidad || 'kg',
                imagen: imagenes[0] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2Y4ZjlmYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gaW1hZ2VuPC90ZXh0Pjwvc3ZnPg==',
                vendedor_nombre: productoDataActual.vendedor_nombre || 'N/A',
                vendedor_id: vendedorId,
                fecha_agregado: firebase.firestore.FieldValue.serverTimestamp(),
                usuario_id: user.uid,
                categoria: productoDataActual.categoria
            };
            
            console.log('📦 Item carrito a guardar:', itemCarrito);
            await db.collection('carrito').add(itemCarrito);
            mostrarNotificacion('✅ Producto agregado al carrito', 'success');
            
            // Actualizar stock disponible mostrado (considerando lo que está en carrito)
            actualizarStockUI(stockActual, productoDataActual.unidad || 'kg', quantity);
        }
        
        // Actualizar productoData local con datos actualizados
        productoData = { id: productoId, ...productoDataActual };
        
        // Resetear cantidad y actualizar UI
        document.getElementById('quantity').value = 1;
        actualizarEstadoBotones();
        
    } catch (error) {
        console.error('❌ Error agregando al carrito:', error);
        mostrarNotificacion('❌ Error al agregar al carrito', 'error');
    }
}

// Comprar ahora
async function comprarAhora() {
    await agregarAlCarrito();
    // Redirigir al carrito después de un breve delay
    setTimeout(() => {
        window.location.href = '/comprador/carrito';
    }, 1000);
}

// Mostrar error
function mostrarError(mensaje) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('errorMessage').textContent = mensaje;
}

// Mostrar notificación
function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion ${tipo}`;
    notificacion.textContent = mensaje;
    
    notificacion.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${tipo === 'success' ? '#4CAF50' : tipo === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notificacion);
    
    setTimeout(() => {
        notificacion.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notificacion.remove(), 300);
    }, 3000);
}

// Abrir Google Maps con la ubicación del vendedor
function abrirGoogleMaps(lat, lng, formattedAddress) {
    let mapsUrl;
    
    // Si tenemos coordenadas, usarlas para mejor precisión
    if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
        mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    } else if (formattedAddress) {
        // Si no hay coordenadas, usar la dirección formateada
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`;
    } else {
        mostrarNotificacion('❌ Ubicación no disponible', 'error');
        return;
    }
    
    // Abrir en una nueva pestaña
    window.open(mapsUrl, '_blank');
}

// Actualizar saludo del usuario
function actualizarSaludoUsuario() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const strongEl = document.getElementById('nav-user-name');
            if (strongEl) {
                let nombre = user.displayName;
                
                if (!nombre && db) {
                    try {
                        const doc = await db.collection('usuarios').doc(user.uid).get();
                        if (doc.exists) {
                            nombre = doc.data().nombre || null;
                        }
                    } catch (e) {
                        console.log('⚠️ Error obteniendo nombre:', e);
                    }
                }
                
                if (!nombre && user.email) {
                    nombre = user.email.split('@')[0];
                }
                
                if (nombre) strongEl.textContent = nombre;
            }
        }
    });
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', async function() {
    console.log('📄 DOM cargado, inicializando página de detalle...');
    
    // Inicializar Firebase
    const firebaseOk = await inicializarFirebase();
    if (!firebaseOk) {
        console.error('❌ No se pudo inicializar Firebase');
        // Intentar de nuevo después de un breve delay
        setTimeout(async () => {
            const retryOk = await inicializarFirebase();
            if (!retryOk) {
                mostrarError('No se pudo conectar con la base de datos. Por favor, verifica tu conexión a internet y recarga la página.');
            } else {
                // Si funciona en el segundo intento, cargar el producto
                await cargarProducto();
            }
        }, 2000);
        return;
    }
    
    // Actualizar saludo
    actualizarSaludoUsuario();
    
    // Event listeners para cantidad
    const quantityInput = document.getElementById('quantity');
    const decreaseBtn = document.getElementById('decreaseBtn');
    const increaseBtn = document.getElementById('increaseBtn');
    
    decreaseBtn.addEventListener('click', function() {
        let value = parseInt(quantityInput.value);
        if (value > 1) {
            quantityInput.value = value - 1;
            actualizarEstadoBotones();
        }
    });
    
    increaseBtn.addEventListener('click', function() {
        let value = parseInt(quantityInput.value);
        const max = parseInt(quantityInput.getAttribute('max')) || 1;
        if (value < max) {
            quantityInput.value = value + 1;
            actualizarEstadoBotones();
        }
    });
    
    quantityInput.addEventListener('input', function() {
        let value = parseInt(this.value);
        const max = parseInt(this.getAttribute('max')) || 1;
        if (value > max) {
            this.value = max;
        } else if (value < 1 || isNaN(value)) {
            this.value = 1;
        }
        actualizarEstadoBotones();
    });
    
    // Event listeners para botones de acción
    document.getElementById('addToCartBtn').addEventListener('click', agregarAlCarrito);
    document.getElementById('buyNowBtn').addEventListener('click', comprarAhora);
    
    // Inicializar sistema de rating y comentarios
    inicializarRating();
    
    // Botón para mostrar formulario de comentarios
    const btnMostrar = document.getElementById('btn-mostrar-comentario');
    if (btnMostrar) {
        btnMostrar.addEventListener('click', mostrarFormularioComentario);
        // Asegurar que el botón esté visible inicialmente
        btnMostrar.style.display = 'inline-flex';
    }
    
    // Botón para ocultar formulario
    const cancelBtn = document.getElementById('cancelCommentBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', ocultarFormularioComentario);
    }
    
    // Botón para publicar comentario
    const submitBtn = document.getElementById('submitCommentBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', publicarComentario);
    }
    
    // Selector de ordenamiento
    const sortSelect = document.getElementById('sortComments');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            if (window.comentariosGlobales && window.comentariosGlobales.length > 0) {
                const orden = this.value;
                const comentariosOrdenados = ordenarComentarios(window.comentariosGlobales, orden);
                mostrarComentarios(comentariosOrdenados);
            }
        });
    }
    
    // Cargar producto
    await cargarProducto();
});

// Verificar stock disponible considerando lo que está en el carrito
async function verificarStockDisponible() {
    try {
        if (!auth || !auth.currentUser || !db || !productoId) {
            return;
        }
        
        // Obtener cantidad actual en carrito
        const carritoSnapshot = await db.collection('carrito')
            .where('usuario_id', '==', auth.currentUser.uid)
            .where('producto_id', '==', productoId)
            .get();
        
        let cantidadEnCarrito = 0;
        if (!carritoSnapshot.empty) {
            cantidadEnCarrito = carritoSnapshot.docs[0].data().cantidad || 0;
        }
        
        // Obtener stock actual de Firestore
        const productoDoc = await db.collection('productos').doc(productoId).get();
        if (productoDoc.exists) {
            const stockTotal = productoDoc.data().stock || 0;
            const unidad = productoDoc.data().unidad || 'kg';
            
            // Actualizar UI con stock disponible
            await actualizarStockUI(stockTotal, unidad, cantidadEnCarrito);
        }
    } catch (error) {
        console.warn('⚠️ Error verificando stock disponible:', error);
        // No es crítico, continuar
    }
}
