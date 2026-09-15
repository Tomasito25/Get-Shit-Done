@echo off
rem GSD en Windows. Doble clic para arrancar.
rem
rem   GSD.cmd              arranca y abre el navegador
rem   GSD.cmd stop         detiene el servidor
rem   GSD.cmd status       dice si esta en marcha
rem   GSD.cmd install      accesos directos en el escritorio y en el menu Inicio
rem   GSD.cmd uninstall    quita los accesos directos (no toca tus datos)
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "codigo=%errorlevel%"
rem Si algo falla, la ventana no se cierra sola: hay que poder leer el motivo.
if not defined CI if "%codigo%"=="1" pause
if not defined CI if "%codigo%"=="2" pause
exit /b %codigo%
