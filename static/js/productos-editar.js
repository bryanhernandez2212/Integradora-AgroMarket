(() => {
const common = window.ProductosCommon;

if (!common) {
    console.error('❌ ProductosCommon no está disponible. Asegúrate de cargar productos-common.js antes de productos-editar.js');
    return;
}

const { ensureFirebase, mostrarMensaje, actualizarSaludoUsuario } = common;

let imagenesSeleccionadas = [];
let imagenesExistentes = [];
let auth = null;
let db = null;
let storage = null;
let currentUser = null;
let productoActual = null;

const productoId = document.body?.dataset?.productoId;

if (!productoId) {
    console.error('❌ No se proporcionó producto_id en data-producto-id');
}

function setSelectValueInsensitive(selectId, rawValue) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const lowerValue = (rawValue || '').toLowerCase();
    const match = Array.from(select.options).find((opt) => opt.value.toLowerCase() === lowerValue);

    if (match) {
        select.value = match.value;
    } else if (rawValue) {
        const newOption = new Option(rawValue, lowerValue, true, true);
        select.add(newOption);
    } else {
        select.value = '';
    }
}

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
    // Validar nombre
    if (!datos.nombre) return 'El nombre es obligatorio';
    if (datos.nombre.length < 3) return 'El nombre debe tener al menos 3 caracteres';
    if (datos.nombre.length > 100) return 'El nombre no puede exceder 100 caracteres';
    
    // Detectar XSS en nombre
    if (typeof SecurityValidation !== 'undefined' && SecurityValidation.detectXSS(datos.nombre)) {
        console.warn('⚠️ Intento de XSS detectado en nombre del producto');
        return 'El nombre contiene caracteres no permitidos. Por favor, usa solo texto normal.';
    }
    
    // Sanitizar nombre
    if (typeof SecurityValidation !== 'undefined') {
        datos.nombre = SecurityValidation.sanitizeString(datos.nombre, 100);
    }

    // Validar descripción
    if (!datos.descripcion) return 'La descripción es obligatoria';
    if (datos.descripcion.length < 10) return 'La descripción debe tener al menos 10 caracteres';
    if (datos.descripcion.length > 1000) return 'La descripción no puede exceder 1000 caracteres';
    
    // Detectar XSS en descripción
    if (typeof SecurityValidation !== 'undefined' && SecurityValidation.detectXSS(datos.descripcion)) {
        console.warn('⚠️ Intento de XSS detectado en descripción del producto');
        return 'La descripción contiene caracteres no permitidos. Por favor, usa solo texto normal.';
    }
    
    // Sanitizar descripción
    if (typeof SecurityValidation !== 'undefined') {
        datos.descripcion = SecurityValidation.sanitizeString(datos.descripcion, 1000);
    }

    if (!datos.categoria) return 'Debes seleccionar una categoría';
    if (!datos.unidad) return 'Debes seleccionar una unidad';

    if (Number.isNaN(datos.precio) || datos.precio <= 0) return 'El precio debe ser un número mayor a 0';
    if (Number.isNaN(datos.stock) || datos.stock <= 0) return 'La cantidad debe ser un número mayor a 0';
    if (datos.unidad === 'kg' && datos.stock < 5) return 'El mínimo son 5 kg. No se permiten valores menores.';

    return null;
}

async function cargarProducto() {
    if (!db) throw new Error('Firestore no inicializado');
    if (!productoId) throw new Error('Identificador del producto no disponible');

    const doc = await db.collection('productos').doc(productoId).get();

    if (!doc.exists) {
        throw new Error('Producto no encontrado');
    }

    productoActual = { id: doc.id, ...doc.data() };

    document.getElementById('nombre').value = productoActual.nombre || '';
    const descripcionTextarea = document.getElementById('descripcion');
    if (descripcionTextarea) descripcionTextarea.value = productoActual.descripcion || '';
    const descripcionCounter = document.getElementById('descripcion-counter');
    if (descripcionTextarea && descripcionCounter) descripcionCounter.textContent = descripcionTextarea.value.length;
    setSelectValueInsensitive('categoria', productoActual.categoria);
    setSelectValueInsensitive('unidad', productoActual.unidad);
    document.getElementById('precio').value = productoActual.precio || '';
    document.getElementById('stock').value = productoActual.stock || '';

    if (Array.isArray(productoActual.imagenes) && productoActual.imagenes.length) {
        imagenesExistentes = [...productoActual.imagenes];
    } else if (productoActual.imagen) {
        imagenesExistentes = [productoActual.imagen];
    } else {
        imagenesExistentes = [];
    }
}

async function subirImagen(archivo, productoId, indice) {
    if (!storage || !currentUser) {
        throw new Error('Firebase Storage no está disponible');
    }

    const nombreArchivo = `productos/${productoId}/imagen_${indice}_${Date.now()}_${archivo.name.replace(/\s+/g, '_')}`;
    const storageRef = storage.ref(nombreArchivo);
    const metadata = {
        contentType: archivo.type,
        customMetadata: {
            productoId,
            vendedorId: currentUser.uid,
            indice: String(indice)
        }
    };

    const snapshot = await storageRef.put(archivo, metadata);
    return snapshot.ref.getDownloadURL();
}

async function subirNuevasImagenes() {
    if (!imagenesSeleccionadas.length) {
        return [];
    }

    const urls = [];
    for (let i = 0; i < imagenesSeleccionadas.length; i += 1) {
        const archivo = imagenesSeleccionadas[i];
        try {
            const url = await subirImagen(archivo, productoId, i + imagenesExistentes.length);
            urls.push(url);
        } catch (error) {
            console.error('❌ Error subiendo imagen', archivo.name, error);
            throw new Error('Error al subir las nuevas imágenes. Intenta de nuevo.');
        }
    }
    return urls;
}

async function actualizarProducto(datos) {
    if (!db || !currentUser) {
        throw new Error('Firebase no está inicializado correctamente');
    }
    if (!productoId) {
        throw new Error('Producto no válido');
    }

    // Sanitizar datos antes de guardar (segunda capa de protección)
    const nombre = typeof SecurityValidation !== 'undefined' 
        ? SecurityValidation.sanitizeString(datos.nombre, 100) 
        : datos.nombre;
    const descripcion = typeof SecurityValidation !== 'undefined' 
        ? SecurityValidation.sanitizeString(datos.descripcion, 1000) 
        : datos.descripcion;
    const categoria = typeof SecurityValidation !== 'undefined' 
        ? SecurityValidation.sanitizeString(datos.categoria, 50) 
        : datos.categoria;
    const unidad = typeof SecurityValidation !== 'undefined' 
        ? SecurityValidation.sanitizeString(datos.unidad, 20) 
        : datos.unidad;

    const payload = {
        nombre: nombre,
        descripcion: descripcion,
        categoria: categoria,
        unidad: unidad,
        precio: datos.precio,
        stock: datos.stock,
        vendedor_id: currentUser.uid,
        vendedor_email: currentUser.email,
        vendedor_nombre: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'anónimo'),
        fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp(),
        activo: true
    };

    let imagenesActualizadas = [...imagenesExistentes];

    if (imagenesSeleccionadas.length) {
        const nuevasUrls = await subirNuevasImagenes();
        imagenesActualizadas = [...imagenesActualizadas, ...nuevasUrls];
    }

    payload.imagen = imagenesActualizadas[0] || null;
    payload.imagenes = imagenesActualizadas;

    await db.collection('productos').doc(productoId).update(payload);

    imagenesExistentes = imagenesActualizadas;
    productoActual = { ...productoActual, ...payload };
    imagenesSeleccionadas = [];
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
        const totalImagenes = imagenesExistentes.length + imagenesSeleccionadas.length;

        if (!totalImagenes) {
            if (imageUploadArea) imageUploadArea.style.display = 'block';
            if (imagesPreviewContainer) imagesPreviewContainer.style.display = 'none';
            if (imagesGrid) imagesGrid.innerHTML = '';
            if (addMoreImagesBtn) addMoreImagesBtn.style.display = 'flex';
            return;
        }

        if (imageUploadArea) imageUploadArea.style.display = 'none';
        if (imagesPreviewContainer) imagesPreviewContainer.style.display = 'block';

        if (imagesGrid) {
            const htmlExistentes = imagenesExistentes.map((url, index) => `
                <div class="image-preview-item" data-index="${index}" data-existing="true">
                    <img src="${url}" alt="Imagen existente ${index + 1}" onerror="this.src='/static/images/product-placeholder.png'">
                    <button type="button" class="remove-image-btn" onclick="window.removerImagenExistente(${index})">
                        <i class="fas fa-times"></i>
                    </button>
                    ${index === 0 && !imagenesSeleccionadas.length ? '<span class="primary-badge">Principal</span>' : ''}
                </div>
            `).join('');

            const htmlNuevas = imagenesSeleccionadas.map((archivo, index) => {
                const url = URL.createObjectURL(archivo);
                const globalIndex = imagenesExistentes.length + index;
                return `
                    <div class="image-preview-item" data-index="${globalIndex}" data-new="true">
                        <img src="${url}" alt="Nueva imagen ${index + 1}">
                        <button type="button" class="remove-image-btn" onclick="window.removerImagenNueva(${index})">
                            <i class="fas fa-times"></i>
                        </button>
                        ${globalIndex === 0 ? '<span class="primary-badge">Principal</span>' : ''}
                    </div>
                `;
            }).join('');

            imagesGrid.innerHTML = htmlExistentes + htmlNuevas;
        }

        if (addMoreImagesBtn) {
            addMoreImagesBtn.style.display = totalImagenes < maxImages ? 'flex' : 'none';
        }
    }

    window.removerImagenExistente = (index) => {
        imagenesExistentes.splice(index, 1);
        renderPreviews();
    };

    window.removerImagenNueva = (index) => {
        imagenesSeleccionadas.splice(index, 1);

        const imagenInputEl = document.getElementById('imagen');
        if (imagenInputEl) {
            const dt = new DataTransfer();
            imagenesSeleccionadas.forEach((archivo) => dt.items.add(archivo));
            imagenInputEl.files = dt.files;
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

            const espaciosDisponibles = maxImages - (imagenesExistentes.length + imagenesSeleccionadas.length);
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

    if (removeAllImagesBtn) {
        removeAllImagesBtn.addEventListener('click', () => {
            if (!imagenesExistentes.length && !imagenesSeleccionadas.length) {
                return;
            }

            if (confirm('¿Deseas eliminar todas las imágenes del producto?')) {
                imagenesExistentes = [];
                imagenesSeleccionadas = [];
                if (imagenInput) imagenInput.value = '';
                renderPreviews();
            }
        });
    }

    renderPreviews();
}

function setupValidaciones() {
    // Reutilizamos validaciones similares al flujo de alta
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

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
    }

    try {
        const datos = obtenerDatosFormulario();
        const error = validarDatosProducto(datos);
        if (error) {
            throw new Error(error);
        }

        mostrarMensaje('⏳ Actualizando producto...', 'info');
        await actualizarProducto(datos);

        mostrarMensaje('✅ Producto actualizado correctamente', 'success');
        window.location.href = '/vendedor/mis_productos?updated=success';
    } catch (error) {
        console.error('❌ Error al actualizar producto:', error);
        mostrarMensaje(`❌ Error: ${error.message || 'No se pudo actualizar el producto'}`, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Actualizar Producto';
        }
    }
}

function cancelarEdicion() {
    if (!productoActual) {
        window.location.href = '/vendedor/mis_productos';
        return;
    }

    const datos = obtenerDatosFormulario();
    const imagenesOriginales = Array.isArray(productoActual.imagenes)
        ? productoActual.imagenes.length
        : (productoActual.imagen ? 1 : 0);

    const hayCambios = (
        datos.nombre !== (productoActual.nombre || '') ||
        datos.descripcion !== (productoActual.descripcion || '') ||
        datos.categoria !== (productoActual.categoria || '') ||
        datos.unidad !== (productoActual.unidad || '') ||
        Number(datos.precio) !== Number(productoActual.precio) ||
        Number(datos.stock) !== Number(productoActual.stock) ||
        imagenesSeleccionadas.length > 0 ||
        imagenesExistentes.length !== imagenesOriginales
    );

    if (hayCambios) {
        if (!confirm('¿Estás seguro de cancelar? Perderás los cambios no guardados.')) {
            return;
        }
    }

    window.location.href = '/vendedor/mis_productos';
}

window.cancelarEdicion = cancelarEdicion;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('productForm');
    if (!form || !productoId) {
        return;
    }

    setupImageHandling();
    setupValidaciones();

    ensureFirebase().then(({ auth: authInstance, db: dbInstance, storage: storageInstance }) => {
        auth = authInstance;
        db = dbInstance;
        storage = storageInstance;

        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = '/auth/login';
                return;
            }

            currentUser = user;
            actualizarSaludoUsuario(user);

            try {
                await cargarProducto();
                // Re-render con imágenes existentes
                setupImageHandling();
            } catch (error) {
                console.error('❌ Error cargando producto:', error);
                mostrarMensaje('❌ Error al cargar el producto. Intenta de nuevo.', 'error');
                return;
            }

            form.addEventListener('submit', handleSubmit);
        });
    }).catch((error) => {
        console.error('❌ Error inicializando Firebase:', error);
        mostrarMensaje('❌ Error de conexión. Recarga la página.', 'error');
    });
});

})();

