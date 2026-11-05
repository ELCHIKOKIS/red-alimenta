# RED-ALIMENTA Backend

API REST de RED-ALIMENTA, construida con Node.js, TypeScript, Express, Prisma y MySQL. Administra usuarios, bancos, inventarios independientes, donaciones, solicitudes, entregas, verificación y auditoría.

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

`SUPER_ADMIN` tiene las mismas funciones operativas que `ADMIN_GENERAL`, además de poder eliminar permanentemente usuarios. La promoción no crea otra cuenta ni cambia contraseñas: después de hacer una copia de seguridad y aplicar la migración pendiente, configura temporalmente `SUPER_ADMIN_EMAIL` con el correo de un administrador general activo ya existente y ejecuta:

```powershell
npm.cmd run prisma:migrate
npm.cmd run prisma:generate
$env:SUPER_ADMIN_EMAIL = 'correo-admin-existente'
npm.cmd run admin:promote-super
Remove-Item Env:SUPER_ADMIN_EMAIL
```

La promoción es de una sola ejecución y falla si ya existe un superadministrador o si la cuenta indicada no es un administrador general activo. Elimina `SUPER_ADMIN_EMAIL` del entorno al terminar. No se aplica ninguna migración automáticamente al iniciar la API.

La eliminación se limita a `SUPER_ADMIN`, no permite borrar la propia cuenta ni al último superadministrador activo. Elimina los datos propios de donante o beneficiario, sus solicitudes, donaciones y documentos, además de los registros de auditoría atribuidos al usuario. Las entregas confirmadas no se borran porque representan operaciones físicas completadas. El sistema rechaza también el borrado cuando la trazabilidad de movimientos no permite reconciliar el inventario con seguridad, cuando el stock aceptado ya está reservado o consumido, o cuando un registro legado solo contiene una referencia de texto que no permite asociarlo con seguridad a una cuenta. Esos casos requieren reconciliación manual. Los movimientos de inventario independientes se conservan para mantener la contabilidad y se desvinculan del usuario al borrarlo. Los documentos se eliminan del almacenamiento después de confirmar la transacción; si falla la limpieza, la respuesta indica cuántos archivos requieren revisión.

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

## Funcionalidades y permisos

- `ADMIN_GENERAL`: administra bancos, usuarios y verificaciones; supervisa operaciones, informes y auditoría.
- `BANCO`: opera solamente sobre bancos donde tiene membresía; gestiona inventario, donaciones y solicitudes, registra entregas y consulta su historial.
- `DONANTE`: registra donaciones y consulta su estado e historial.
- `BENEFICIARIO`: completa su verificación, consulta disponibilidad publicada en su cobertura, solicita productos y confirma entregas.

Una donación solo modifica el inventario después de ser aceptada por el banco receptor. Las aprobaciones parciales reservan cantidades, y las entregas actualizan el inventario mediante movimientos auditables. La autorización se valida en el backend; ocultar funciones en Android no sustituye estos controles.

Los usuarios autenticados pueden actualizar su perfil en `PATCH /api/auth/me`. Si un beneficiario modifica los datos de identificación o cobertura de su organización, su cuenta vuelve a estado pendiente y debe ser verificada nuevamente.

Los documentos de verificación aceptan PDF, JPEG o PNG hasta 5 MB y se almacenan localmente en `storage/documents` por defecto. `DOCUMENTS_DIR` permite configurar otra ubicación; no se debe exponer esa carpeta públicamente.

## Pruebas y dependencias

```powershell
npm.cmd test
npm.cmd audit
```

Las pruebas unitarias actuales cubren hash de contraseñas y tokens. Las pruebas que requieren MySQL deben ejecutarse con una base de datos de desarrollo independiente.
