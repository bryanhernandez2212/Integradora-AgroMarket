# Script de Actualización de Compras

Este script actualiza las compras existentes en Firestore agregando el campo `vendedores_ids` que es necesario para que las reglas de seguridad funcionen correctamente.

## ¿Qué hace?

- Lee todas las compras existentes en Firestore
- Extrae los IDs únicos de vendedores de los productos en cada compra
- Agrega el campo `vendedores_ids` como un array a cada compra
- Omite las compras que ya tienen este campo

## Requisitos

1. **Node.js** instalado (versión 14 o superior)
2. **Archivo de credenciales de Firebase** (`serviceAccountKey.json`) en la carpeta `config/`
3. **Dependencias de Node.js** instaladas:
   ```bash
   npm install firebase-admin
   ```

## Cómo ejecutar

1. Asegúrate de tener el archivo `serviceAccountKey.json` en `config/`
2. Instala las dependencias si no las tienes:
   ```bash
   npm install firebase-admin
   ```
3. Ejecuta el script:
   ```bash
   node scripts/actualizar-compras-vendedores-ids.js
   ```

## Salida esperada

El script mostrará:
- El número de compras encontradas
- El progreso de la actualización
- Un resumen final con:
  - Compras actualizadas
  - Compras sin vendedores
  - Errores (si los hay)

## Notas importantes

- El script usa batches de Firestore para actualizar múltiples documentos eficientemente
- Las compras que ya tienen `vendedores_ids` se omiten automáticamente
- El script es seguro: solo agrega el campo `vendedores_ids`, no modifica otros datos

## Solución de problemas

Si obtienes un error de permisos:
- Verifica que el archivo `serviceAccountKey.json` tenga los permisos correctos
- Asegúrate de que el archivo esté en la ubicación correcta (`config/serviceAccountKey.json`)

Si obtienes un error de "module not found":
- Ejecuta `npm install firebase-admin` en la raíz del proyecto

