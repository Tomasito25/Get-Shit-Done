@echo off
rem Crea el acceso directo de GSD en el escritorio y en el menu Inicio.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" install
set "codigo=%errorlevel%"
if not defined CI pause
exit /b %codigo%
