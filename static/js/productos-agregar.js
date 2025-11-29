(() => {
const common = window.ProductosCommon;

if (!common) {
    console.error('❌ ProductosCommon no está disponible. Asegúrate de cargar productos-common.js antes de productos-agregar.js');
    return;
}

const { ensureFirebase, mostrarMensaje, actualizarSaludoUsuario } = common;

let imagenesSeleccionadas = [];
let auth = null;
let db = null;
let storage = null;
let currentUser = null;
let stripeReady = true; // Permitir publicar productos sin validación de Stripe
let stripeChecking = false;
let submitButton = null;
let stripeWarningShown = false;
let stripeStatusCache = null;
const STRIPE_STATUS_CACHE_KEY = 'stripe_status_cache';
const STRIPE_CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutos

function cerrarSesion() {
    if (!auth) {
        window.location.href = '/auth/login';
        return;
    }

    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        auth.signOut().then(() => {
            window.location.href = '/auth/login';
        }).catch(() => {
            mostrarMensaje('❌ Error al cerrar sesión. Intenta de nuevo.', 'error');
        });
    }
}

window.cerrarSesion = cerrarSesion;

function actualizarEstadoBoton() {
    if (!submitButton) {
        return;
    }

    // Permitir publicar productos sin validación de Stripe
    submitButton.disabled = false;
    submitButton.innerHTML = '<i class="fas fa-upload"></i> Publicar Producto';
}

function mostrarRestriccionStripe(mensaje) {
    if (!stripeWarningShown) {
        mostrarMensaje(mensaje, 'warning');
        stripeWarningShown = true;
    }
}

async function verificarEstadoStripe(uid, email, options = {}) {
    const { showLoader = true, forceRefresh = false } = options;

    if (!uid) {
        stripeReady = false;
        mostrarRestriccionStripe('No identificamos al vendedor. Inicia sesión nuevamente.');
        actualizarEstadoBoton();
        return;
    }

    try {
        let data = null;

        if (!forceRefresh) {
            data = loadCachedStatus(uid);
            if (data) {
                console.log('Stripe Cache: usando estado almacenado para', uid, data);
            }
        }

        if (!data) {
            if (showLoader) {
        stripeChecking = true;
        actualizarEstadoBoton();
            }

            const statusUrl = new URL(`/vendors/status/${encodeURIComponent(uid)}`, window.location.origin);
            if (email) {
                statusUrl.searchParams.set('email', email);
            }

            const response = await fetch(statusUrl.toString(), {
            credentials: 'same-origin'
        });
            data = await response.json();

        if (!response.ok) {
                clearCachedStatus(uid);
            throw new Error(data.error || 'No fue posible verificar tu configuración de cobros.');
            }

            console.log('Stripe Fetch: respuesta recibida', data);

            if (data && !data.pending) {
                saveCachedStatus(uid, data);
            } else {
                clearCachedStatus(uid);
            }
        }

        if (data.pending) {
            stripeReady = false;
            stripeStatusCache = null;
            mostrarRestriccionStripe('Completa tu configuración de cobros en tu panel antes de publicar productos.');
            return;
        }

        const status = data.status || {};
        stripeReady = Boolean(status.charges_enabled && status.payouts_enabled && status.details_submitted);
        stripeStatusCache = data;

        if (!stripeReady) {
            if (status.requirements_due && status.requirements_due.length) {
                mostrarRestriccionStripe('Tienes requisitos pendientes en Stripe. Completa la verificación para continuar.');
            } else {
                mostrarRestriccionStripe('Completa tu configuración de cobros en tu panel antes de publicar productos.');
            }
        } else {
            mostrarMensaje('✅ Tu cuenta de Stripe está lista para recibir pagos.', 'success');
            stripeWarningShown = false;
        }
    } catch (error) {
        console.error('❌ Error verificando Stripe Connect:', error);
        stripeReady = false;
        mostrarRestriccionStripe(error.message || 'No fue posible validar tu cuenta de cobros.');
        clearCachedStatus(uid);
    } finally {
        stripeChecking = false;
        actualizarEstadoBoton();
    }
}

function obtenerDatosFormulario() {
    const nombre = document.getElementById('nombre')?.value.trim() || '';
    const descripcion = document.getElementById('descripcion')?.value.trim() || '';
    const categoria = (document.getElementById('categoria')?.value || '').toLowerCase();
    const unidad = (document.getElementById('unidad')?.value || '').toLowerCase();
    const precio = parseFloat(document.getElementById('precio')?.value || '');
    const stock = parseInt(document.getElementById('stock')?.value || '');

    return { nombre, descripcion, categoria, unidad, precio, stock };
}

function validarDatosProducto(datos) {
    if (!datos.nombre) return 'El nombre es obligatorio';
    if (datos.nombre.length < 3) return 'El nombre debe tener al menos 3 caracteres';
    if (datos.nombre.length > 100) return 'El nombre no puede exceder 100 caracteres';

    if (!datos.descripcion) return 'La descripción es obligatoria';
    if (datos.descripcion.length < 10) return 'La descripción debe tener al menos 10 caracteres';
    if (datos.descripcion.length > 1000) return 'La descripción no puede exceder 1000 caracteres';

    if (!datos.categoria) return 'Debes seleccionar una categoría';
    if (!datos.unidad) return 'Debes seleccionar una unidad';

    if (Number.isNaN(datos.precio) || datos.precio <= 0) return 'El precio debe ser un número mayor a 0';
    if (Number.isNaN(datos.stock) || datos.stock <= 0) return 'La cantidad debe ser un número mayor a 0';
    if (datos.unidad === 'kg' && datos.stock < 5) return 'El mínimo son 5 kg. No se permiten valores menores.';

    return null;
}

async function guardarProducto(datos) {
    if (!db || !currentUser) {
        throw new Error('Firebase no está inicializado correctamente');
    }

    const producto = {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        categoria: datos.categoria,
        unidad: datos.unidad,
        precio: datos.precio,
        stock: datos.stock,
        vendedor_id: currentUser.uid,
        vendedor_email: currentUser.email,
        vendedor_nombre: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'anónimo'),
        fecha_publicacion: firebase.firestore.FieldValue.serverTimestamp(),
        fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp(),
        activo: true,
        vendido: 0,
        calificacion_promedio: 0,
        total_calificaciones: 0
    };

    const docRef = await db.collection('productos').add(producto);
    return docRef.id;
}

async function subirImagen(archivo, productoId, indice) {
    if (!storage || !currentUser) {
        throw new Error('Firebase Storage no está disponible');
    }

    // Verificar que Storage esté correctamente inicializado
    if (!storage.ref) {
        throw new Error('Firebase Storage no está correctamente inicializado. Por favor, recarga la página.');
    }

    // Verificar que el usuario esté autenticado
    if (!currentUser.uid) {
        throw new Error('Usuario no autenticado. Por favor, inicia sesión.');
    }

    try {
        const nombreArchivo = `productos/${productoId}/imagen_${indice}_${Date.now()}_${archivo.name.replace(/\s+/g, '_')}`;
        console.log('📤 Subiendo imagen a:', nombreArchivo);
        console.log('👤 Usuario autenticado:', currentUser.uid);
        
        const storageRef = storage.ref(nombreArchivo);
        const metadata = {
            contentType: archivo.type,
            customMetadata: {
                productoId,
                vendedorId: currentUser.uid,
                indice: String(indice)
            }
        };

        console.log('⏳ Iniciando subida...');
        const snapshot = await storageRef.put(archivo, metadata);
        console.log('✅ Imagen subida exitosamente');
        
        console.log('⏳ Obteniendo URL de descarga...');
        const downloadURL = await snapshot.ref.getDownloadURL();
        console.log('✅ URL obtenida:', downloadURL);
        
        return downloadURL;
    } catch (error) {
        console.error('❌ Error subiendo imagen:', error);
        console.error('❌ Código de error:', error.code);
        console.error('❌ Mensaje:', error.message);
        
        // Manejo específico de errores comunes
        if (error.code === 'storage/unauthorized') {
            throw new Error('No tienes permisos para subir archivos. Verifica las reglas de Storage en Firebase Console.');
        } else if (error.code === 'storage/quota-exceeded') {
            throw new Error('Se ha excedido la cuota de almacenamiento de Firebase.');
        } else if (error.code === 'storage/unauthenticated') {
            throw new Error('Debes iniciar sesión para subir archivos.');
        } else if (error.code === 412 || (error.message && error.message.includes('412'))) {
            throw new Error('Error 412: Problema de permisos en Firebase Storage. Verifica las reglas de Storage y los permisos IAM en Google Cloud Console.');
        } else if (error.code === 'storage/unknown') {
            throw new Error('Error desconocido al subir archivo. Verifica tu conexión a internet y las reglas de Storage.');
        }
        
        throw new Error(`Error al subir imagen: ${error.message || 'Error desconocido'}`);
    }
}

async function subirImagenes(productoId) {
    if (!imagenesSeleccionadas.length) {
        return [];
    }

    const urls = [];
    for (let i = 0; i < imagenesSeleccionadas.length; i += 1) {
        const archivo = imagenesSeleccionadas[i];
        try {
            const url = await subirImagen(archivo, productoId, i);
            urls.push(url);
        } catch (error) {
            console.error('❌ Error subiendo imagen', archivo.name, error);
            throw new Error('Error al subir las imágenes. Intenta de nuevo.');
        }
    }
    return urls;
}

function setupImageHandling() {
    const imagenInput = document.getElementById('imagen');
    const imageUploadArea = document.getElementById('imageUploadArea');
    const imagesPreviewContainer = document.getElementById('imagesPreviewContainer');
    const imagesGrid = document.getElementById('imagesGrid');
    const addMoreImagesBtn = document.getElementById('addMoreImagesBtn');
    const removeAllImagesBtn = document.getElementById('removeAllImages');

    const maxImages = 5;

    function renderPreviews() {
        if (!imagenesSeleccionadas.length) {
            if (imageUploadArea) imageUploadArea.style.display = 'block';
            if (imagesPreviewContainer) imagesPreviewContainer.style.display = 'none';
            if (imagesGrid) imagesGrid.innerHTML = '';
            if (addMoreImagesBtn) addMoreImagesBtn.style.display = 'flex';
            return;
        }

        if (imageUploadArea) imageUploadArea.style.display = 'none';
        if (imagesPreviewContainer) imagesPreviewContainer.style.display = 'block';

        if (imagesGrid) {
            imagesGrid.innerHTML = imagenesSeleccionadas.map((archivo, index) => {
                const url = URL.createObjectURL(archivo);
                return `
                    <div class="image-preview-item" data-index="${index}">
                        <img src="${url}" alt="Imagen ${index + 1}">
                        <button type="button" class="remove-image-btn" onclick="window.removerImagen(${index})">
                            <i class="fas fa-times"></i>
                        </button>
                        ${index === 0 ? '<span class="primary-badge">Principal</span>' : ''}
                    </div>
                `;
            }).join('');
        }

        if (addMoreImagesBtn) {
            addMoreImagesBtn.style.display = imagenesSeleccionadas.length < maxImages ? 'flex' : 'none';
        }
    }

    window.removerImagen = (index) => {
        imagenesSeleccionadas.splice(index, 1);

        if (imagenInput) {
            const dt = new DataTransfer();
            imagenesSeleccionadas.forEach((archivo) => dt.items.add(archivo));
            imagenInput.files = dt.files;
        }

        renderPreviews();
    };

    if (imageUploadArea && imagenInput) {
        imageUploadArea.addEventListener('click', () => imagenInput.click());
    }

    if (imagenInput) {
        imagenInput.addEventListener('change', (event) => {
            const archivos = Array.from(event.target.files || []);
            if (!archivos.length) return;

            const espaciosDisponibles = maxImages - imagenesSeleccionadas.length;
            if (espaciosDisponibles <= 0) {
                mostrarMensaje(`❌ Ya alcanzaste el máximo de ${maxImages} imágenes`, 'error');
                imagenInput.value = '';
                return;
            }

            const archivosValidos = [];
            archivos.forEach((archivo) => {
                if (!archivo.type.startsWith('image/')) {
                    mostrarMensaje(`❌ El archivo "${archivo.name}" no es una imagen válida`, 'error');
                    return;
                }
                if (archivo.size > 5 * 1024 * 1024) {
                    mostrarMensaje(`❌ La imagen "${archivo.name}" es demasiado grande. Máximo 5MB`, 'error');
                    return;
                }
                archivosValidos.push(archivo);
            });

            const archivosAceptados = archivosValidos.slice(0, espaciosDisponibles);
            imagenesSeleccionadas = [...imagenesSeleccionadas, ...archivosAceptados];

            if (archivosValidos.length > espaciosDisponibles) {
                mostrarMensaje(`⚠️ Solo se agregaron ${espaciosDisponibles} imagen(es).`, 'warning');
            }

            renderPreviews();
        });
    }

    if (addMoreImagesBtn && imagenInput) {
        addMoreImagesBtn.addEventListener('click', () => imagenInput.click());
    }

    if (removeAllImagesBtn && imagenInput) {
        removeAllImagesBtn.addEventListener('click', () => {
            if (!imagenesSeleccionadas.length) {
                return;
            }

            if (confirm('¿Deseas eliminar todas las imágenes seleccionadas?')) {
                imagenesSeleccionadas = [];
                imagenInput.value = '';
                renderPreviews();
            }
        });
    }

    renderPreviews();
}

function setupValidaciones() {
    const nombreInput = document.getElementById('nombre');
    const nombreError = document.getElementById('nombre-error');
    const nombreErrorTexto = document.getElementById('nombre-error-texto');

    if (nombreInput && nombreError && nombreErrorTexto) {
        nombreInput.addEventListener('blur', () => {
            const valor = nombreInput.value.trim();
            if (!valor) {
                nombreError.style.display = 'flex';
                nombreErrorTexto.textContent = 'El nombre es obligatorio';
                nombreInput.style.borderColor = '#dc3545';
            } else if (valor.length < 3) {
                nombreError.style.display = 'flex';
                nombreErrorTexto.textContent = 'El nombre debe tener al menos 3 caracteres';
                nombreInput.style.borderColor = '#dc3545';
            } else if (valor.length > 100) {
                nombreError.style.display = 'flex';
                nombreErrorTexto.textContent = 'El nombre no puede exceder 100 caracteres';
                nombreInput.style.borderColor = '#dc3545';
            } else {
                nombreError.style.display = 'none';
                nombreInput.style.borderColor = '';
            }
        });

        nombreInput.addEventListener('input', () => {
            if (nombreInput.value.trim().length >= 3 && nombreInput.value.trim().length <= 100) {
                nombreError.style.display = 'none';
                nombreInput.style.borderColor = '';
            }
        });
    }

    const descripcionTextarea = document.getElementById('descripcion');
    const descripcionError = document.getElementById('descripcion-error');
    const descripcionErrorTexto = document.getElementById('descripcion-error-texto');
    const descripcionCounter = document.getElementById('descripcion-counter');

    if (descripcionTextarea && descripcionError && descripcionErrorTexto && descripcionCounter) {
        descripcionTextarea.addEventListener('input', () => {
            const length = descripcionTextarea.value.length;
            descripcionCounter.textContent = length;

            if (length < 10) {
                descripcionError.style.display = 'flex';
                descripcionErrorTexto.textContent = `Mínimo 10 caracteres (${length}/10)`;
                descripcionTextarea.style.borderColor = '#dc3545';
            } else if (length > 1000) {
                descripcionError.style.display = 'flex';
                descripcionErrorTexto.textContent = 'Máximo 1000 caracteres';
                descripcionTextarea.style.borderColor = '#dc3545';
            } else {
                descripcionError.style.display = 'none';
                descripcionTextarea.style.borderColor = '';
            }
        });

        descripcionTextarea.addEventListener('blur', () => {
            const valor = descripcionTextarea.value.trim();
            if (!valor) {
                descripcionError.style.display = 'flex';
                descripcionErrorTexto.textContent = 'La descripción es obligatoria';
                descripcionTextarea.style.borderColor = '#dc3545';
            } else if (valor.length < 10) {
                descripcionError.style.display = 'flex';
                descripcionErrorTexto.textContent = 'La descripción debe tener al menos 10 caracteres';
                descripcionTextarea.style.borderColor = '#dc3545';
            } else if (valor.length > 1000) {
                descripcionError.style.display = 'flex';
                descripcionErrorTexto.textContent = 'La descripción no puede exceder 1000 caracteres';
                descripcionTextarea.style.borderColor = '#dc3545';
            } else {
                descripcionError.style.display = 'none';
                descripcionTextarea.style.borderColor = '';
            }
        });
    }

    const categoriaSelect = document.getElementById('categoria');
    const categoriaError = document.getElementById('categoria-error');
    if (categoriaSelect && categoriaError) {
        categoriaSelect.addEventListener('change', () => {
            if (!categoriaSelect.value) {
                categoriaError.style.display = 'flex';
                categoriaSelect.style.borderColor = '#dc3545';
            } else {
                categoriaError.style.display = 'none';
                categoriaSelect.style.borderColor = '';
            }
        });
    }

    const unidadSelect = document.getElementById('unidad');
    const unidadMensaje = document.getElementById('unidad-mensaje');
    const unidadError = document.getElementById('unidad-error');
    const stockInput = document.getElementById('stock');
    const stockMensaje = document.getElementById('stock-mensaje');
    const stockMensajeTexto = document.getElementById('stock-mensaje-texto');
    const stockError = document.getElementById('stock-error');

    function validarStock() {
        if (!unidadSelect || !stockInput) return;

        const unidad = unidadSelect.value;
        const stock = parseInt(stockInput.value || '0', 10);

        if (unidad === 'kg') {
            if (stock > 0 && stock < 5) {
                if (stockError) stockError.style.display = 'flex';
                stockInput.setCustomValidity('El mínimo son 5 kg. No se permiten valores menores.');
                stockInput.style.borderColor = '#dc3545';
            } else {
                if (stockError) stockError.style.display = 'none';
                stockInput.setCustomValidity('');
                stockInput.style.borderColor = '';
            }
        } else {
            if (stockMensaje) stockMensaje.style.display = 'none';
            if (unidadMensaje) unidadMensaje.style.display = 'none';
            if (stockError) stockError.style.display = 'none';
            stockInput.setCustomValidity('');
            stockInput.style.borderColor = '';
        }
    }

    if (unidadSelect && stockInput) {
        unidadSelect.addEventListener('change', (event) => {
            if (event.target.value === 'kg') {
                if (unidadMensaje) unidadMensaje.style.display = 'flex';
                if (stockMensaje && stockMensajeTexto) {
                    stockMensaje.style.display = 'flex';
                    stockMensajeTexto.textContent = 'Mínimo 5 kg';
                }
                stockInput.min = 5;
            } else {
                if (unidadMensaje) unidadMensaje.style.display = 'none';
                if (stockMensaje) stockMensaje.style.display = 'none';
                if (stockError) stockError.style.display = 'none';
                stockInput.min = 1;
            }
            validarStock();
        });

        stockInput.addEventListener('input', validarStock);
        stockInput.addEventListener('blur', validarStock);

        if (unidadSelect.value === 'kg' && stockInput.value) {
            validarStock();
        }
    }

    const precioInput = document.getElementById('precio');
    const precioError = document.getElementById('precio-error');
    const precioErrorTexto = document.getElementById('precio-error-texto');
    if (precioInput && precioError && precioErrorTexto) {
        precioInput.addEventListener('blur', () => {
            const precio = parseFloat(precioInput.value || '');
            if (Number.isNaN(precio)) {
                precioError.style.display = 'flex';
                precioErrorTexto.textContent = 'El precio es obligatorio';
                precioInput.style.borderColor = '#dc3545';
            } else if (precio <= 0) {
                precioError.style.display = 'flex';
                precioErrorTexto.textContent = 'El precio debe ser mayor a 0';
                precioInput.style.borderColor = '#dc3545';
            } else {
                precioError.style.display = 'none';
                precioInput.style.borderColor = '';
            }
        });

        precioInput.addEventListener('input', () => {
            const precio = parseFloat(precioInput.value || '');
            if (!Number.isNaN(precio) && precio > 0) {
                precioError.style.display = 'none';
                precioInput.style.borderColor = '';
            }
        });
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submitBtn = form.querySelector('.submit-btn');

    // Validación de Stripe removida - se permite publicar productos sin cuenta de Stripe

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    }

    try {
        const datos = obtenerDatosFormulario();
        const error = validarDatosProducto(datos);
        if (error) {
            throw new Error(error);
        }

        mostrarMensaje('⏳ Guardando producto...', 'info');
        const productoId = await guardarProducto(datos);

        if (imagenesSeleccionadas.length) {
            mostrarMensaje(`📤 Subiendo ${imagenesSeleccionadas.length} imagen(es)...`, 'info');
            const urls = await subirImagenes(productoId);
            await db.collection('productos').doc(productoId).update({
                imagen: urls[0] || null,
                imagenes: urls,
                fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        mostrarMensaje('✅ ¡Producto guardado exitosamente!', 'success');

        form.reset();
        imagenesSeleccionadas = [];
        setupImageHandling();

        setTimeout(() => {
            window.location.href = '/vendedor/mis_productos';
        }, 1500);
    } catch (error) {
        console.error('❌ Error al guardar producto:', error);
        mostrarMensaje(`❌ Error: ${error.message || 'No se pudo guardar el producto'}`, 'error');
    } finally {
        actualizarEstadoBoton();
    }
}

function saveCachedStatus(vendorId, payload) {
    try {
        const entry = {
            vendorId,
            payload,
            savedAt: Date.now(),
        };
        sessionStorage.setItem(`${STRIPE_STATUS_CACHE_KEY}_${vendorId}`, JSON.stringify(entry));
    } catch (error) {
        console.warn('No se pudo guardar caché Stripe:', error);
    }
}

function clearCachedStatus(vendorId) {
    try {
        sessionStorage.removeItem(`${STRIPE_STATUS_CACHE_KEY}_${vendorId}`);
    } catch (error) {
        console.warn('No se pudo limpiar caché Stripe:', error);
    }
}

function loadCachedStatus(vendorId) {
    try {
        const raw = sessionStorage.getItem(`${STRIPE_STATUS_CACHE_KEY}_${vendorId}`);
        if (!raw) {
            return null;
        }
        const entry = JSON.parse(raw);
        if (!entry || !entry.payload || !entry.savedAt) {
            return null;
        }
        if (Date.now() - entry.savedAt > STRIPE_CACHE_EXPIRATION) {
            sessionStorage.removeItem(`${STRIPE_STATUS_CACHE_KEY}_${vendorId}`);
            return null;
        }
        return entry.payload;
    } catch (error) {
        console.warn('No se pudo leer caché Stripe:', error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('productForm');
    if (!form) {
        return;
    }

    submitButton = form.querySelector('.submit-btn');
    stripeChecking = false;
    actualizarEstadoBoton();

    setupImageHandling();
    setupValidaciones();

    ensureFirebase().then(({ auth: authInstance, db: dbInstance, storage: storageInstance }) => {
        auth = authInstance;
        db = dbInstance;
        storage = storageInstance;

        auth.onAuthStateChanged((user) => {
            if (!user) {
                window.location.href = '/auth/login';
                return;
            }

            currentUser = user;
            actualizarSaludoUsuario(user);

            // Validación de Stripe removida - se permite publicar productos sin cuenta de Stripe
            stripeReady = true;
            stripeChecking = false;
            actualizarEstadoBoton();
        });

        form.addEventListener('submit', handleSubmit);
    }).catch((error) => {
        console.error('❌ Error inicializando Firebase:', error);
        mostrarMensaje('❌ Error de conexión. Recarga la página.', 'error');
        stripeChecking = false;
        stripeReady = true; // Mantener habilitado para permitir publicar productos
        actualizarEstadoBoton();
    });
});

})();

