// Script para regenerar URLs de imágenes de productos
// Ejecutar en la consola del navegador cuando estés autenticado como administrador

(async function regenerarUrlsImagenes() {
    console.log('🔄 Iniciando regeneración de URLs de imágenes...');
    
    try {
        // Inicializar Firebase
        if (typeof firebase === 'undefined') {
            throw new Error('Firebase no está cargado');
        }
        
        if (firebase.apps.length === 0) {
            firebase.initializeApp(window.firebaseConfig);
        }
        
        const db = firebase.firestore();
        const storage = firebase.storage();
        const auth = firebase.auth();
        
        // Verificar autenticación
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Debes estar autenticado para ejecutar este script');
        }
        
        console.log('✅ Usuario autenticado:', user.email);
        
        // Obtener todos los productos
        const productosSnapshot = await db.collection('productos').get();
        console.log(`📦 Encontrados ${productosSnapshot.size} productos`);
        
        let actualizados = 0;
        let errores = 0;
        
        for (const doc of productosSnapshot.docs) {
            const producto = doc.data();
            const productoId = doc.id;
            
            try {
                // Si tiene imagen, verificar y regenerar URL si es necesario
                if (producto.imagen) {
                    const imagenUrl = producto.imagen;
                    
                    // Intentar obtener la referencia desde la URL
                    try {
                        const storageRef = storage.refFromURL(imagenUrl);
                        
                        // Generar nueva URL de descarga
                        const nuevaUrl = await storageRef.getDownloadURL();
                        
                        // Si la URL cambió, actualizar en Firestore
                        if (nuevaUrl !== imagenUrl) {
                            await db.collection('productos').doc(productoId).update({
                                imagen: nuevaUrl,
                                fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`✅ Producto ${productoId} actualizado`);
                            actualizados++;
                        } else {
                            console.log(`✓ Producto ${productoId} - URL válida`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ Error procesando imagen del producto ${productoId}:`, error);
                        errores++;
                    }
                }
                
                // Si tiene array de imágenes, procesarlas también
                if (Array.isArray(producto.imagenes) && producto.imagenes.length > 0) {
                    const nuevasUrls = [];
                    
                    for (const url of producto.imagenes) {
                        try {
                            const storageRef = storage.refFromURL(url);
                            const nuevaUrl = await storageRef.getDownloadURL();
                            nuevasUrls.push(nuevaUrl);
                        } catch (error) {
                            console.warn(`⚠️ Error procesando imagen en array:`, error);
                            // Mantener la URL original si falla
                            nuevasUrls.push(url);
                        }
                    }
                    
                    // Actualizar si hay cambios
                    const urlPrincipal = nuevasUrls[0] || null;
                    if (urlPrincipal !== producto.imagen || JSON.stringify(nuevasUrls) !== JSON.stringify(producto.imagenes)) {
                        await db.collection('productos').doc(productoId).update({
                            imagen: urlPrincipal,
                            imagenes: nuevasUrls,
                            fecha_actualizacion: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`✅ Producto ${productoId} - imágenes actualizadas`);
                        actualizados++;
                    }
                }
            } catch (error) {
                console.error(`❌ Error procesando producto ${productoId}:`, error);
                errores++;
            }
        }
        
        console.log('\n📊 Resumen:');
        console.log(`✅ Productos actualizados: ${actualizados}`);
        console.log(`❌ Errores: ${errores}`);
        console.log('✅ Proceso completado');
        
    } catch (error) {
        console.error('❌ Error en regeneración de URLs:', error);
    }
})();

