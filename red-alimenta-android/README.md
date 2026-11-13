# RED-ALIMENTA para Android

Aplicación única en Kotlin y Jetpack Compose, conectada al backend de RED-ALIMENTA. La navegación y las operaciones disponibles dependen del rol validado por el backend.

## Requisitos

- Android Studio y Android SDK 35.
- JDK 17 o superior.
- MySQL y el backend configurados; consulta el [README del backend](../red-alimenta-backend/README.md).

## Configurar la API

Por defecto, tanto la variante `debug` como la variante `release` se conectan a la API desplegada en Render: `https://red-alimenta-api.onrender.com/`.

Si deseas conectar el emulador o un dispositivo al backend local durante el desarrollo, debes especificar la URL local explícitamente mediante las propiedades Gradle `debugApiBaseUrl` o `apiBaseUrl` (por ejemplo, con un parámetro `-P`, o definiéndola en `gradle.properties` o `local.properties`):

```powershell
.\gradlew.bat :app:assembleDebug -PdebugApiBaseUrl=http://10.0.2.2:4000/
```

La URL de `release` debe usar HTTPS; Gradle rechaza HTTP para esa variante y el manifiesto también bloquea tráfico sin cifrar. En `debug`, HTTP se permite únicamente mediante selección explícita y solo para `10.0.2.2`, `localhost` o `127.0.0.1`. Estas propiedades solo contienen la URL pública de la API; no incluyas contraseñas ni tokens en la configuración de Gradle o en el repositorio.

## Compilar y ejecutar

Abre esta carpeta en Android Studio, sincroniza Gradle, selecciona un emulador y ejecuta la configuración `app`. También puedes generar el APK de depuración desde PowerShell:

```powershell
.\gradlew.bat :app:assembleDebug
```

El APK se genera en `app/build/outputs/apk/debug/app-debug.apk`.

## Flujos disponibles

- Inicio de sesión, registro público de donantes y organizaciones beneficiarias, recuperación de sesión y cierre de sesión.
- Edición del perfil de usuario y carga de foto JPEG, PNG o WebP (máximo 5 MB); los cambios a los datos de identificación de una organización beneficiaria requieren nueva verificación administrativa.
- Beneficiarios: consulta de disponibilidad publicada, envío de solicitudes, estado e historial de entregas y carga de documentos PDF/JPEG/PNG (máximo 5 MB).
- Donantes: registro de donaciones y consulta de sus estados.
- Bancos: inventario privado, publicación de disponibilidad, revisión de donaciones, aprobación total o parcial de solicitudes, registro de entregas, consulta de donantes, beneficiarios e historial.
- Administradores: gestión de bancos y usuarios de banco, revisión de registros de beneficiarios, administración de usuarios, operaciones e informes. Solo `SUPER_ADMIN` ve las acciones de eliminación permanente de usuarios, bancos, productos, donaciones, solicitudes y entregas; cada acción pide confirmación y conserva el historial de auditoría.

Los tokens de sesión se protegen con Android Keystore y almacenamiento cifrado local. El APK desactiva las copias de seguridad para evitar restaurar datos cifrados sin la clave correspondiente. El backend sigue siendo responsable de autorizar cada operación y validar existencias.
