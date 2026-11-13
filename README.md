# RED-ALIMENTA

RED-ALIMENTA es una plataforma para una red de bancos de alimentos. Incluye una aplicación Android nativa y una API REST para administrar bancos e inventarios independientes, usuarios por rol, donaciones, solicitudes, entregas, verificación e informes.

## Estructura del proyecto

- [`red-alimenta-android/`](./red-alimenta-android/): aplicación Android desarrollada con Kotlin y Jetpack Compose.
- [`red-alimenta-backend/`](./red-alimenta-backend/): API REST desarrollada con Node.js, TypeScript, Express, Prisma y MySQL.
- [`red-alimenta-web/`](./red-alimenta-web/): página estática de presentación de RED-ALIMENTA.

Cada proyecto tiene su propio README con detalles y comandos específicos:

- [Guía de la aplicación Android](./red-alimenta-android/README.md)
- [Guía del backend](./red-alimenta-backend/README.md)

## Ejecutar localmente en Windows

### 1. Preparar MySQL

Inicia el servicio MySQL del entorno local y configura `DATABASE_URL` en el archivo `.env` del backend para usar una base de desarrollo, no la base de producción.

### 2. Iniciar el backend

Desde la raíz del repositorio, abre PowerShell y ejecuta:

```powershell
Set-Location .\red-alimenta-backend
npm.cmd run dev
```

La primera vez, prepara las dependencias, el archivo `.env`, el primer administrador y Prisma siguiendo la [guía del backend](./red-alimenta-backend/README.md). Antes de aplicar la migración de múltiples bancos, realiza una copia de seguridad de MySQL y revisa la sección de migración de esa guía. El archivo `.env` contiene configuración local y no se debe subir al repositorio.

Puedes comprobar que la API responde en:

```text
http://localhost:4000/health
```

### 3. Abrir la aplicación Android

Abre en Android Studio la carpeta `red-alimenta-android`, sincroniza Gradle, selecciona un emulador y ejecuta la configuración `app`.

La URL predeterminada de desarrollo para el emulador es `http://10.0.2.2:4000/`; esta dirección permite que el emulador acceda al backend que se ejecuta en el equipo anfitrión.

## Publicar la página de presentación

La carpeta `red-alimenta-web` contiene una página estática sin dependencias ni proceso de compilación. Para publicarla en Render, crea un servicio **Static Site** conectado a este repositorio y configura:

- Branch: `main`
- Root Directory: `red-alimenta-web`
- Build Command: dejar vacío
- Publish Directory: `.`

El botón de descarga apunta a la última GitHub Release y espera el archivo `red-alimenta-1.1.apk`.

## Seguridad y configuración

- No publiques archivos `.env`, contraseñas ni credenciales.
- El backend debe tener su variable `DATABASE_URL` configurada localmente para conectarse a MySQL.
- Para configurar otra URL de API en Android, consulta la guía de [`red-alimenta-android`](./red-alimenta-android/README.md).
