# RED-ALIMENTA Backend

API REST y Socket.IO de RED-ALIMENTA, construida con Node.js, TypeScript, Express, Prisma y MySQL. Administra usuarios, bancos, inventarios independientes, donaciones, solicitudes, entregas, verificación y auditoría.

## Requisitos

- Node.js y npm.
- MySQL 8.
- PowerShell en Windows. Si `npm.ps1` está bloqueado, usa `npm.cmd`.

## Configuración

Desde esta carpeta instala dependencias y crea tu archivo local `.env` a partir de `.env.example`. Configura una URL válida de MySQL en `DATABASE_URL` y un `JWT_SECRET` aleatorio de al menos 32 bytes. No publiques `.env` ni incluyas contraseñas en el repositorio.

Genera un secreto local en PowerShell:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes)
```

Configura MySQL, genera el cliente Prisma y compila:

```powershell
npm.cmd install
npx.cmd prisma generate
npm.cmd test
```

## Migración de la base de datos

La migración `20261015180000_multibank_foundation` agrega soporte para los nuevos roles, sesiones, bancos, membresías, coberturas, perfiles de beneficiarios, documentos de verificación, inventario por banco, movimientos, solicitudes con varios productos, entregas y auditoría.

La migración `20261113010000_product_images` agrega `productos.imagen_url` (nullable) y la tabla `imagenes_productos` para guardar fotografías en MySQL. Es aditiva: conserva los productos existentes y permite que sigan usando las imágenes locales por categoría hasta que se cargue una fotografía.

La migración `20261113020000_user_profile_images` agrega la tabla `fotos_perfil` para guardar una fotografía opcional por usuario. No modifica los usuarios existentes; las fotos se guardan en MySQL, con un límite de 5 MB y acceso autenticado.

Para conservar los datos existentes:

- No elimina tablas ni registros existentes.
- Crea un banco inicial llamado `Banco RED-ALIMENTA inicial`.
- Asocia las donaciones y entregas históricas a ese banco.
- Marca las donaciones antiguas como aceptadas para que no vuelvan a sumar existencias.
- Copia las existencias actuales de cada producto al inventario privado del banco inicial (`publicado = false`).
- Conserva `productos.stock_actual` como dato legado; las nuevas operaciones usan `inventarios`.

Antes de aplicarla, realiza y verifica una copia de seguridad de MySQL. Después de revisar esa copia y confirmar que `DATABASE_URL` apunta a la base correcta, ejecuta:

```powershell
npm.cmd run prisma:migrate
```

Este comando aplica migraciones pendientes y no debe sustituirse por `prisma db push`. La migración no se ejecuta automáticamente al iniciar la API.

Antes de desplegar la versión de la API que incluye fotografías, aplica también la migración `20261113010000_product_images` en el entorno correspondiente. El esquema debe estar actualizado antes de iniciar ese código; de lo contrario, las consultas de productos no encontrarán la columna nueva.

`prisma/schema.prisma` es el esquema canónico. Las migraciones existentes se conservan en orden como historial; no se deben consolidar ni eliminar sin una estrategia de re-baseline coordinada para todos los entornos, porque puede romper `prisma migrate deploy` en Aiven o Render.

## Crear el primer administrador

El registro público solo permite solicitar cuentas de donante o beneficiario. El primer administrador se crea manualmente y el script se detiene si ya existe uno. Configura localmente `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en `.env`; usa una contraseña propia de al menos 12 caracteres. Luego ejecuta:

```powershell
npm.cmd run admin:create
```

No se crea una cuenta ni una contraseña predeterminada.

Para crear el primer `SUPER_ADMIN` en una base sin usuarios, configura localmente `BOOTSTRAP_SUPER_ADMIN_NAME`, `BOOTSTRAP_SUPER_ADMIN_EMAIL` y `BOOTSTRAP_SUPER_ADMIN_PASSWORD` en `.env`; usa una contraseña propia de al menos 12 caracteres. El script falla sin crear una cuenta si ya existe cualquier usuario. Después de aplicar las migraciones, ejecuta:

```powershell
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
npm.cmd run superadmin:create
```

El script guarda la contraseña con el hash scrypt usado por el backend. No establece credenciales predeterminadas; elimina las variables `BOOTSTRAP_SUPER_ADMIN_*` del entorno al terminar.

## Superadministrador y eliminación permanente

`SUPER_ADMIN` tiene las mismas funciones operativas que `ADMIN_GENERAL`, además de poder eliminar permanentemente usuarios, bancos, productos, donaciones, solicitudes y entregas. Android presenta una confirmación que describe el alcance antes de enviar cada eliminación. Se borran también los registros de auditoría relacionados. Las entregas confirmadas se pueden eliminar, pero sus cantidades no se reponen al inventario porque los alimentos ya fueron recibidos. Si una cantidad pendiente no se puede reconciliar con seguridad, el borrado continúa, conserva los valores actuales de inventario y devuelve una advertencia para revisión manual. La promoción no crea otra cuenta ni cambia contraseñas: después de hacer una copia de seguridad y aplicar la migración pendiente, configura temporalmente `SUPER_ADMIN_EMAIL` con el correo de un administrador general activo ya existente y ejecuta:

```powershell
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
$env:SUPER_ADMIN_EMAIL = 'correo-admin-existente'
npm.cmd run admin:promote-super
Remove-Item Env:SUPER_ADMIN_EMAIL
```

La promoción es de una sola ejecución y falla si ya existe un superadministrador o si la cuenta indicada no es un administrador general activo. Elimina `SUPER_ADMIN_EMAIL` del entorno al terminar. No se aplica ninguna migración automáticamente al iniciar la API.

La eliminación se limita a `SUPER_ADMIN` y no permite borrar la propia cuenta ni al último superadministrador activo. Al borrar un usuario se eliminan sus perfiles de donante o beneficiario, solicitudes, donaciones, entregas, documentos y auditoría relacionada. Al borrar bancos o productos se eliminan también sus operaciones, inventarios e imágenes dependientes. Los movimientos confirmados no reponen existencias; los ajustes inseguros se omiten y se notifican en la respuesta. Los movimientos no relacionados con los registros eliminados se conservan. Los documentos se eliminan del almacenamiento después de confirmar la transacción; si falla la limpieza, la respuesta indica cuántos archivos requieren revisión.

## Ejecutar

Con MySQL disponible y la migración aplicada:

```powershell
npm.cmd run dev
```

La API escucha en el puerto definido por `PORT` (4000 por defecto). Comprueba el estado en `http://localhost:4000/health`. Para compilar y ejecutar la versión generada:

```powershell
npm.cmd run build
npm.cmd start
```

La misma instancia HTTP acepta conexiones Socket.IO mediante WebSocket seguro (`wss` en producción). Android se autentica con el token JWT y recibe avisos de cambios solo en las salas de su cuenta, banco, rol administrativo o cobertura autorizada. Los avisos contienen identificadores, no registros privados; la aplicación vuelve a consultar los endpoints REST para obtener los datos vigentes. REST sigue funcionando si WebSocket no está disponible.

Con una sola instancia, la distribución de eventos es local al proceso. Para escalar el servicio a varias instancias en Render, configura `REALTIME_REDIS_URL` con una conexión Redis privada y TLS (`rediss://`) para activar el adaptador de Socket.IO. Si Redis no está disponible, la API REST sigue funcionando y el backend registra que la distribución en tiempo real es local. Los clientes se reconectan y sincronizan por REST después de una interrupción; no se consulta MySQL periódicamente para detectar cambios.

## Funcionalidades y permisos

- `ADMIN_GENERAL`: administra bancos, usuarios y verificaciones; supervisa operaciones, informes y auditoría.
- `BANCO`: opera solamente sobre bancos donde tiene membresía; gestiona inventario, donaciones y solicitudes, registra entregas y consulta su historial.
- `DONANTE`: registra donaciones y consulta su estado e historial.
- `BENEFICIARIO`: completa su verificación, consulta disponibilidad publicada en su cobertura, solicita productos y confirma entregas.

Una donación solo modifica el inventario después de ser aceptada por el banco receptor. Las aprobaciones parciales reservan cantidades, y las entregas actualizan el inventario mediante movimientos auditables. La autorización se valida en el backend; ocultar funciones en Android no sustituye estos controles.

Los usuarios autenticados pueden actualizar su perfil en `PATCH /api/auth/me`. Si un beneficiario modifica los datos de identificación o cobertura de su organización, su cuenta vuelve a estado pendiente y debe ser verificada nuevamente.

Los documentos de verificación aceptan PDF, JPEG o PNG hasta 5 MB y se almacenan localmente en `storage/documents` por defecto. `DOCUMENTS_DIR` permite configurar otra ubicación; no se debe exponer esa carpeta públicamente.

Las fotografías de productos aceptan JPEG, PNG o WebP hasta 5 MB. Se guardan en la tabla `imagenes_productos` de MySQL, por lo que están disponibles en otros dispositivos y no dependen del disco temporal de Render. Los productos existentes conservan `imagenUrl = null` y usan las ilustraciones locales de Android por categoría.

Las fotografías de perfil también se almacenan en MySQL. Cada usuario autenticado puede consultar su propia foto; `GET /api/admin/users/:id/photo` permite que `ADMIN_GENERAL` y `SUPER_ADMIN` vean las fotos desde la lista de usuarios, con autorización autenticada.

## Pruebas y dependencias

```powershell
npm.cmd test
npm.cmd audit
```

Las pruebas unitarias cubren hash de contraseñas, tokens, roles y aislamiento de salas en Socket.IO. Las pruebas que requieren MySQL deben ejecutarse con una base de datos de desarrollo independiente.
