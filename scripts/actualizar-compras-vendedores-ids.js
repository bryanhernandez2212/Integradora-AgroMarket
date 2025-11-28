/**
 * Script para actualizar las compras existentes con el campo vendedores_ids
 * Este script extrae los IDs de vendedores de los productos en cada compra
 * y los agrega como un array vendedores_ids para que las reglas de Firestore funcionen correctamente
 * 
 * Uso: node scripts/actualizar-compras-vendedores-ids.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Buscar el archivo de credenciales en diferentes ubicaciones
const possiblePaths = [
  path.join(__dirname, '../config/serviceAccountKey.json'),
  path.join(__dirname, '../config/firebase-service-account.json'),
  path.join(__dirname, '../firebase-service-account.json'),
  path.join(__dirname, '../serviceAccountKey.json')
];

let serviceAccountPath = null;
for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    serviceAccountPath = possiblePath;
    console.log(`📁 Usando credenciales de: ${serviceAccountPath}`);
    break;
  }
}

if (!serviceAccountPath) {
  console.error('❌ No se encontró el archivo de credenciales de Firebase.');
  console.error('   Buscado en:', possiblePaths);
  console.error('   Por favor, coloca serviceAccountKey.json en config/');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Inicializar Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function actualizarComprasConVendedoresIds() {
  try {
    console.log('🔄 Iniciando actualización de compras con vendedores_ids...');
    
    // Obtener todas las compras
    const comprasSnapshot = await db.collection('compras').get();
    
    if (comprasSnapshot.empty) {
      console.log('ℹ️ No hay compras para actualizar');
      return;
    }
    
    console.log(`📦 Encontradas ${comprasSnapshot.size} compras para procesar`);
    
    let actualizadas = 0;
    let sinVendedores = 0;
    let errores = 0;
    
    // Procesar cada compra
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore permite máximo 500 operaciones por batch
    
    for (const compraDoc of comprasSnapshot.docs) {
      try {
        const compraData = compraDoc.data();
        const compraId = compraDoc.id;
        
        // Verificar si ya tiene vendedores_ids
        if (compraData.vendedores_ids && Array.isArray(compraData.vendedores_ids) && compraData.vendedores_ids.length > 0) {
          console.log(`⏭️ Compra ${compraId} ya tiene vendedores_ids, omitiendo...`);
          continue;
        }
        
        // Extraer vendedores_ids únicos de los productos
        const productos = compraData.productos || [];
        const vendedoresIds = [];
        
        productos.forEach(producto => {
          const vendedorId = producto.vendedor_id || producto.vendedorId || '';
          if (vendedorId && vendedorId.trim() !== '' && !vendedoresIds.includes(vendedorId)) {
            vendedoresIds.push(vendedorId);
          }
        });
        
        if (vendedoresIds.length === 0) {
          console.log(`⚠️ Compra ${compraId} no tiene vendedores en sus productos`);
          sinVendedores++;
          continue;
        }
        
        // Actualizar el documento
        const compraRef = db.collection('compras').doc(compraId);
        batch.update(compraRef, {
          vendedores_ids: vendedoresIds
        });
        
        batchCount++;
        actualizadas++;
        
        console.log(`✅ Compra ${compraId}: agregados ${vendedoresIds.length} vendedores_ids`, vendedoresIds);
        
        // Si el batch está lleno, ejecutarlo
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`💾 Batch de ${batchCount} actualizaciones guardado`);
          batchCount = 0;
        }
        
      } catch (error) {
        console.error(`❌ Error procesando compra ${compraDoc.id}:`, error.message);
        errores++;
      }
    }
    
    // Ejecutar el batch final si hay operaciones pendientes
    if (batchCount > 0) {
      await batch.commit();
      console.log(`💾 Batch final de ${batchCount} actualizaciones guardado`);
    }
    
    // Resumen
    console.log('\n📊 Resumen de actualización:');
    console.log(`   ✅ Compras actualizadas: ${actualizadas}`);
    console.log(`   ⚠️ Compras sin vendedores: ${sinVendedores}`);
    console.log(`   ❌ Errores: ${errores}`);
    console.log(`   📦 Total procesadas: ${comprasSnapshot.size}`);
    
    console.log('\n✅ Actualización completada exitosamente');
    
  } catch (error) {
    console.error('❌ Error en la actualización:', error);
    throw error;
  }
}

// Ejecutar el script
actualizarComprasConVendedoresIds()
  .then(() => {
    console.log('🎉 Script finalizado');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });

