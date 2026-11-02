# RED-ALIMENTA Backend

Guía para configurar y ejecutar el backend en Windows con la instalación local de MySQL utilizada durante el desarrollo.

## Requisitos

- Node.js y npm disponibles en PowerShell.
- Dependencias instaladas en `node_modules`.
- MySQL 8 instalado en `C:\Users\juanf\tools\mysql`.

Si PowerShell bloquea `npm.ps1`, usa `npm.cmd` en los comandos de npm.

## Configuración inicial

Abre PowerShell en esta carpeta:

```powershell
cd C:\Users\juanf\U\red-alimenta\red-alimenta-backend
```

Si es la primera instalación, instala las dependencias:

```powershell
npm.cmd install
```

Configura la conexión a MySQL en el archivo `.env`, en la raíz del backend:

```dotenv
DATABASE_URL="mysql://USUARIO:CONTRASENA@127.0.0.1:3306/red_alimenta"
PORT=4000
```

Sustituye `USUARIO` y `CONTRASENA` por las credenciales de MySQL de tu equipo. No compartas ni subas `.env`: este archivo está excluido de Git. `.env.example` sirve como referencia para las variables necesarias.

Para generar el cliente de Prisma y sincronizar el esquema con la base de datos:

```powershell
npx.cmd prisma generate
npx.cmd prisma db push
```

## Iniciar MySQL

Haz doble clic en `iniciar-base-datos.bat`, ubicado en la raíz de este proyecto. El archivo inicia únicamente el servidor MySQL; no inicia Prisma ni el backend. Deja abierta la ventana mientras utilices la aplicación. Para detener MySQL, presiona `Ctrl+C` en esa ventana.

También puedes iniciar MySQL desde una terminal de PowerShell:

```powershell
.\iniciar-base-datos.bat
```

El archivo `.bat` utiliza esta instalación local:

- Ejecutable: `C:\Users\juanf\tools\mysql\bin\mysqld.exe`
- Configuración: `C:\Users\juanf\tools\mysql\my.ini`
- Puerto local: `3306`

## Iniciar el backend

Con MySQL iniciado, abre una segunda terminal. Ejecuta los comandos desde la carpeta del backend:

```powershell
cd C:\Users\juanf\U\red-alimenta\red-alimenta-backend
npm.cmd run dev
```

Mantén la terminal abierta mientras uses el backend. Para detenerlo, presiona `Ctrl+C` en esa terminal.

Comprueba que está activo visitando:

```text
http://localhost:4000/health
```

Al probar la aplicación en el emulador Android, el emulador accede al backend del equipo mediante `http://10.0.2.2:4000/`.

## Otros comandos

Compilar TypeScript:

```powershell
npm.cmd run build
```

Iniciar la versión compilada:

```powershell
npm.cmd start
```

El comando de prueba configurado en el proyecto compila el backend:

```powershell
npm.cmd test
```

## Archivos de configuración importantes

- `prisma/schema.prisma`: definición del esquema de base de datos.
- `.env.example`: referencia de las variables de entorno requeridas.
- `.env`: configuración local de conexión; no se debe compartir ni subir al repositorio.
- `iniciar-base-datos.bat`: acceso directo para iniciar MySQL en este equipo.
