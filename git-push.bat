@echo off
echo ===== Iniciando proceso de Git =====
echo.

echo Agregando archivos...
git add .
echo.

echo Ingrese el mensaje del commit:
set /p commit_message=

echo.
echo Creando commit con mensaje: %commit_message%
git commit -m "%commit_message%"
echo.

echo Subiendo cambios al repositorio...
git push origin main
echo.

echo ===== Proceso completado =====
echo.
pause 