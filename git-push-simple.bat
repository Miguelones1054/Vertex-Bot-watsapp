@echo off
echo ===== Iniciando proceso de Git =====
echo.

echo Agregando archivos...
git add .
echo.

echo Creando commit...
git commit -m "Actualización automática"
echo.

echo Subiendo cambios al repositorio...
git push origin main
echo.

echo ===== Proceso completado =====
echo.
pause 