@echo off
title Base de datos Red Alimenta
echo Iniciando MySQL para Red Alimenta...
echo Deja esta ventana abierta mientras uses la aplicacion.
echo Para detener MySQL, presiona Ctrl+C.
echo.
"C:\Users\juanf\tools\mysql\bin\mysqld.exe" --defaults-file="C:\Users\juanf\tools\mysql\my.ini" --console
if errorlevel 1 (
  echo.
  echo MySQL termino con un error. Revisa los mensajes anteriores.
  pause
)
