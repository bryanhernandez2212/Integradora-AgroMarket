# Práctica: Build de Aplicación en GitHub + Docker + Docker Hub

Este documento contiene las instrucciones para completar la práctica de DevOps con la aplicación AgroMarket.

## 📋 Requerimientos Previos

- ✅ Cuenta en GitHub
- ✅ Cuenta en Docker Hub
- ✅ Git instalado
- ✅ Docker Desktop instalado
- ✅ Editor de código (VS Code recomendado)

## 🚀 Actividades de la Práctica

### Actividad 1: Configurar el Repositorio en GitHub

1. Si aún no tienes el repositorio en GitHub:
   - Ve a GitHub → "New Repository"
   - Asigna un nombre, por ejemplo: `Integradora-AgroMarket`
   - Selecciona Público o Privado
   - Añade README.md si no existe

2. Si el repositorio ya existe, asegúrate de tener los últimos cambios:
   ```bash
   git pull origin main
   ```

### Actividad 2: Verificar la Aplicación Base

La aplicación Flask ya está configurada. Verifica que tengas:
- ✅ `app.py` - Aplicación principal Flask
- ✅ `requirements.txt` - Dependencias de Python
- ✅ `Dockerfile` - Configuración de Docker (ya creado)
- ✅ `.dockerignore` - Archivos a excluir del build (ya creado)

### Actividad 3: Construir la Imagen Docker Localmente

1. **Construir la imagen Docker:**
   ```bash
   docker build -t tuusuario/agromarket:v1 .
   ```
   ⚠️ **Reemplaza `tuusuario` con tu nombre de usuario de Docker Hub**

2. **Verificar que la imagen se creó:**
   ```bash
   docker images
   ```
   Deberías ver `tuusuario/agromarket` en la lista.

3. **Probar la imagen localmente:**
   ```bash
   docker run -p 5001:5001 tuusuario/agromarket:v1
   ```

4. **Abrir en el navegador:**
   - Ve a: `http://localhost:5001`
   - Deberías ver la aplicación funcionando

5. **Detener el contenedor:**
   - Presiona `Ctrl+C` en la terminal

### Actividad 4: Subir la Imagen a Docker Hub

1. **Autenticarse en Docker Hub:**
   ```bash
   docker login
   ```
   - Ingresa tu nombre de usuario de Docker Hub
   - Ingresa tu contraseña (o token de acceso)

2. **Hacer push de la imagen:**
   ```bash
   docker push tuusuario/agromarket:v1
   ```

3. **Verificar en Docker Hub:**
   - Ve a tu perfil en Docker Hub: `https://hub.docker.com/u/tuusuario`
   - Deberías ver el repositorio `agromarket` con la imagen `v1`

### Actividad 5: Configurar GitHub Actions (CI/CD)

#### Paso 1: Crear Access Token en Docker Hub

1. Ve a Docker Hub → **Account Settings** → **Security**
2. Haz clic en **New Access Token**
3. Asigna un nombre (ej: `github-actions`)
4. Copia el token generado (solo se muestra una vez)

#### Paso 2: Configurar Secretos en GitHub

1. Ve a tu repositorio en GitHub
2. Ve a **Settings** → **Secrets and variables** → **Actions**
3. Haz clic en **New repository secret**
4. Crea los siguientes secretos:

   **Secreto 1:**
   - Name: `DOCKERHUB_USERNAME`
   - Value: Tu nombre de usuario de Docker Hub

   **Secreto 2:**
   - Name: `DOCKERHUB_TOKEN`
   - Value: El token de acceso que generaste en Docker Hub

#### Paso 3: Actualizar el Workflow (Opcional)

El archivo `.github/workflows/docker-build.yml` ya está creado. Si necesitas cambiar el nombre de la imagen, edita la línea:

```yaml
images: ${{ secrets.DOCKERHUB_USERNAME }}/agromarket
```

Cambia `agromarket` por el nombre que prefieras.

#### Paso 4: Hacer Push y Verificar

1. **Subir los cambios a GitHub:**
   ```bash
   git add .
   git commit -m "Configuración de Docker y GitHub Actions"
   git push origin main
   ```

2. **Verificar el workflow:**
   - Ve a tu repositorio en GitHub
   - Haz clic en la pestaña **Actions**
   - Deberías ver el workflow "Build y Push de Docker" ejecutándose
   - Espera a que termine (debería tomar unos minutos)

3. **Verificar en Docker Hub:**
   - Después de que el workflow termine exitosamente
   - Ve a Docker Hub y verifica que la imagen `latest` se haya creado

### Actividad 6: Probar la Automatización

1. **Hacer un cambio pequeño en el código:**
   - Edita cualquier archivo (por ejemplo, añade un comentario)
   - Haz commit y push:
     ```bash
     git add .
     git commit -m "Test de CI/CD"
     git push origin main
     ```

2. **Observar el workflow:**
   - Ve a **Actions** en GitHub
   - El workflow debería ejecutarse automáticamente
   - Una vez completado, verifica que la nueva imagen esté en Docker Hub

## 📦 Comandos Útiles

### Docker

```bash
# Construir imagen
docker build -t tuusuario/agromarket:v1 .

# Ejecutar contenedor
docker run -p 5001:5001 tuusuario/agromarket:v1

# Ejecutar en segundo plano
docker run -d -p 5001:5001 --name agromarket tuusuario/agromarket:v1

# Ver contenedores corriendo
docker ps

# Ver logs del contenedor
docker logs agromarket

# Detener contenedor
docker stop agromarket

# Eliminar contenedor
docker rm agromarket

# Eliminar imagen
docker rmi tuusuario/agromarket:v1

# Usar docker-compose
docker-compose up
docker-compose down
```

### Git

```bash
# Ver estado
git status

# Añadir cambios
git add .

# Hacer commit
git commit -m "Mensaje descriptivo"

# Subir cambios
git push origin main

# Ver historial
git log
```

## ✅ Producto Final Esperado

Para completar la práctica, entrega:

1. **URL del repositorio GitHub** con:
   - ✅ Código de la app
   - ✅ Dockerfile
   - ✅ Workflow de GitHub Actions (`.github/workflows/docker-build.yml`)

2. **URL del repositorio en Docker Hub** con la imagen publicada:
   - Ejemplo: `https://hub.docker.com/r/tuusuario/agromarket`

3. **Evidencias (capturas de pantalla):**
   - ✅ Construcción local del Docker (`docker build`)
   - ✅ Docker corriendo en localhost (navegador mostrando la app)
   - ✅ Docker Hub mostrando la imagen
   - ✅ GitHub Actions mostrando el pipeline ejecutado exitosamente

## 🔧 Solución de Problemas

### Error: "Cannot connect to the Docker daemon"
- Asegúrate de que Docker Desktop esté corriendo

### Error: "denied: requested access to the resource is denied"
- Verifica que hayas hecho `docker login`
- Verifica que el nombre de usuario en el tag coincida con tu usuario de Docker Hub

### Error en GitHub Actions: "Invalid credentials"
- Verifica que los secretos `DOCKERHUB_USERNAME` y `DOCKERHUB_TOKEN` estén configurados correctamente
- Asegúrate de que el token de Docker Hub no haya expirado

### La aplicación no carga en el navegador
- Verifica que el puerto sea correcto (5001)
- Verifica que el contenedor esté corriendo: `docker ps`
- Revisa los logs: `docker logs <container_id>`

## 📝 Notas Adicionales

- El Dockerfile está optimizado para producción
- El workflow de GitHub Actions se ejecuta automáticamente en cada push a `main` o `master`
- Las imágenes se etiquetan automáticamente con `latest` cuando se hace push a la rama principal
- Para desarrollo local, puedes usar `docker-compose up` que incluye volúmenes para hot-reload

