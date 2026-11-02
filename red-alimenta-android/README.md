# Red Alimenta para Android

Aplicación Android nativa en Kotlin y Jetpack Compose para consultar productos, registrar donaciones y registrar entregas mediante la API REST del backend `red-alimenta-backend`.

## Requisitos para compilar

- Android Studio con JDK 17 o superior.
- Android SDK 35.
- Gradle 8.9, compatible con Android Gradle Plugin 8.7.3.

## Configurar la API

El valor de desarrollo predeterminado es `http://10.0.2.2:4000/`, dirección con la que el emulador Android accede al backend ejecutado en el equipo anfitrión.

Para compilar contra una API accesible en la nube, define su URL base:

```powershell
gradle assembleDebug -PapiBaseUrl=https://tu-api-desplegada.example/
```

También puedes abrir esta carpeta en Android Studio y configurar `-PapiBaseUrl=https://tu-api-desplegada.example/` en los argumentos de Gradle. No incluyas credenciales en los argumentos ni en el repositorio. La variante `release` bloquea tráfico HTTP sin cifrar; publica el APK únicamente después de configurar una URL HTTPS real.

## Compilar e instalar

Desde Android Studio, abre la carpeta `red-alimenta-android`, espera la sincronización de Gradle y ejecuta la variante `app`.

Para generar un APK de depuración desde una terminal con Gradle instalado:

```powershell
gradle assembleDebug
```

El APK se genera en `app/build/outputs/apk/debug/app-debug.apk`.

## Funcionalidades implementadas

- Listado, creación, edición y desactivación lógica de productos.
- Listado y registro de donaciones.
- Listado y registro de entregas, con validación previa de stock.
- Actualización manual y al completar operaciones.
- Mensajes visibles para errores de conexión y errores enviados por la API.

El backend es quien valida de forma definitiva el stock y procesa las transacciones. La validación en la app solo mejora la experiencia de captura.
