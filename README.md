# RED-ALIMENTA

Proyecto compuesto por una aplicación Android nativa y un backend REST. La aplicación Android se comunica con el backend para consultar y actualizar la información de productos, donaciones y entregas.

## Estructura del proyecto

- [`red-alimenta-android/`](./red-alimenta-android/): aplicación Android desarrollada con Kotlin y Jetpack Compose.
- [`red-alimenta-backend/`](./red-alimenta-backend/): API REST desarrollada con Node.js, TypeScript, Express, Prisma y MySQL.

Cada proyecto tiene su propio README con detalles y comandos específicos:

- [Guía de la aplicación Android](./red-alimenta-android/README.md)
- [Guía del backend](./red-alimenta-backend/README.md)

## Ejecutar localmente en Windows

### 1. Iniciar MySQL

Haz doble clic en [`red-alimenta-backend/iniciar-base-datos.bat`](./red-alimenta-backend/iniciar-base-datos.bat) y deja abierta su ventana mientras utilizas la aplicación.

Este script inicia MySQL únicamente; no inicia la API ni modifica el esquema de Prisma.

### 2. Iniciar el backend

Abre otra terminal PowerShell y ejecuta:

```powershell
cd C:\Users\juanf\U\red-alimenta\red-alimenta-backend
npm.cmd run dev
```

La primera vez, prepara las dependencias, el archivo `.env` y Prisma siguiendo la [guía del backend](./red-alimenta-backend/README.md). El archivo `.env` contiene configuración local y no se debe subir al repositorio.

Puedes comprobar que la API responde en:

```text
http://localhost:4000/health
```

### 3. Abrir la aplicación Android

Abre en Android Studio la carpeta `red-alimenta-android`, sincroniza Gradle, selecciona un emulador y ejecuta la configuración `app`.

La URL predeterminada de desarrollo para el emulador es `http://10.0.2.2:4000/`; esta dirección permite que el emulador acceda al backend que se ejecuta en el equipo anfitrión.

## Seguridad y configuración

- No publiques archivos `.env`, contraseñas ni credenciales.
- El backend debe tener su variable `DATABASE_URL` configurada localmente para conectarse a MySQL.
- Para configurar otra URL de API en Android, consulta la guía de [`red-alimenta-android`](./red-alimenta-android/README.md).

