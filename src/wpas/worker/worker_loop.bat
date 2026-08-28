@echo off
REM Ejecute este archivo desde Task Scheduler al iniciar sesion de Windows.
REM BlueZone es grafico: use una cuenta con sesion interactiva abierta.
setlocal
set "WORKER_DIR=%~dp0"
set "POLL_SECONDS=15"

:loop
call "%WORKER_DIR%lanzar_wpa.bat"
timeout /t %POLL_SECONDS% /nobreak >nul
goto loop
