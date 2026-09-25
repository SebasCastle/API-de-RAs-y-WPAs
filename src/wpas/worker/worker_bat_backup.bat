@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ========================================================
REM WPAS WORKER - NEST + BLUEZONE WEB-TO-HOST
REM ========================================================
REM
REM 1. Verificar archivos; si faltan, descargarlos de Nest.
REM 2. Cerrar cualquier BlueZone activo.
REM 3. Si hay job: iniciar BlueZone, esperar al JS, cerrar BlueZone.
REM 4. Si hay otro job, repetir el ciclo.
REM 5. Si no hay job, esperar 30s. Si sigue sin peticion:
REM    informar "apagando instancia" (en pruebas NO se apaga nada).
REM 6. BlueZone se cierra SIEMPRE: error, exito o nuevo ciclo.
REM ========================================================

set "RUTA_ORIGEN=%~dp0"
set "RUTA_BZ_EXE=%USERPROFILE%\AppData\Local\Temp\BlueZone\7.1"

set "TERMINAL_ZMD=INTL-mod2(A)-LAC-v1PTLS.zmd"
set "TERMINAL_ID=DWT0HB2E"
set "WORKER_ID=%COMPUTERNAME%"

if not defined WPAS_API_BASE set "WPAS_API_BASE=http://localhost:3000/api/sync"

set "URL_PENDING=%WPAS_API_BASE%/wpa/worker/jobs/pending"
set "URL_STATUS=%WPAS_API_BASE%/wpa/worker/status"
set "URL_HEARTBEAT=%WPAS_API_BASE%/wpa/worker/heartbeat"
set "URL_LOG=%WPAS_API_BASE%/wpa/worker/logs"
set "URL_FAILURE=%WPAS_API_BASE%/wpa/worker/failure"
set "URL_SHUTDOWN=%WPAS_API_BASE%/wpa/worker/shutdown"
set "URL_SCRIPT=%WPAS_API_BASE%/wpa/worker/resources/script.js"
set "URL_BZLP=%WPAS_API_BASE%/wpa/worker/resources/bzw2h.bzlp"
set "URL_BAT=%WPAS_API_BASE%/wpa/worker/resources/Lanzador_Bluezone.bat"

set "RUTA_SCRIPTS=%USERPROFILE%\OneDrive\Documentos\BlueZone\Scripts"
if not exist "%RUTA_SCRIPTS%" set "RUTA_SCRIPTS=%USERPROFILE%\OneDrive\Documents\BlueZone\Scripts"
if not exist "%RUTA_SCRIPTS%" set "RUTA_SCRIPTS=%USERPROFILE%\Documents\BlueZone\Scripts"

set "SCRIPT_NAME=Script_Bluezone_a_Web (server)_AWS.js"
set "BZLP_NAME=bzw2h.bzlp"

set "STEP_WAIT=2"
set "IDLE_TIMEOUT_SECONDS=30"
set "TIMEOUT_SESSION_MANAGER=30"
set "TIMEOUT_BLUEZONE=30"
set "SCRIPT_WAIT_TIMEOUT=300"
set "STATUS_FAIL_MAX=3"
set "CLOSE_RETRIES=3"
set "POLL_SECONDS=5"

REM 0 = pruebas locales: avisa apagado pero NO apaga ni termina el worker
REM 1 = AWS: avisa a Nest y termina el BAT
set "AWS_AUTO_SHUTDOWN=1"

set "LOG_FILE=%RUTA_ORIGEN%Lanzador_Bluezone.log.txt"

call :log INFO "=================================================="
call :log INFO "INICIANDO WORKER BLUEZONE"
call :log INFO "Worker ID: %WORKER_ID%"
call :log INFO "Backend: %WPAS_API_BASE%"
call :log INFO "AWS_AUTO_SHUTDOWN=%AWS_AUTO_SHUTDOWN%"
call :log INFO "=================================================="
call :wait_step

where curl >nul 2>&1
if errorlevel 1 (
    call :fatal "No se encontro curl. No se puede hablar con Nest ni descargar recursos."
)

where powershell >nul 2>&1
if errorlevel 1 (
    call :fatal "No se encontro PowerShell. No se pueden detectar procesos exclusivos de BlueZone."
)

if not exist "%RUTA_BZ_EXE%\BZMD.PRO" (
    call :fatal "No se encontro BZMD.PRO: %RUTA_BZ_EXE%\BZMD.PRO"
)
call :log SUCCESS "BZMD.PRO encontrado."
call :wait_step

call :ensure_files
if errorlevel 1 goto WORKER_FATAL

call :heartbeat "ONLINE"
call :wait_step

call :log INFO "Cerrando BlueZone si quedo alguna instancia activa."
call :ensure_bluezone_closed
if errorlevel 1 (
    call :report_failure "No se pudo dejar BlueZone cerrado al iniciar." "ensure_bluezone_closed"
    goto WORKER_FATAL
)

goto WORKER_LOOP


REM ========================================================
REM LOOP PRINCIPAL
REM ========================================================

:WORKER_LOOP

call :ensure_bluezone_closed
if errorlevel 1 (
    call :report_failure "BlueZone activo no se pudo cerrar antes del ciclo." "ensure_bluezone_closed"
    goto WORKER_FATAL
)

call :log INFO "Consultando jobs pendientes en Nest."
call :check_pending
if /I "!PENDING!"=="ERROR" (
    call :report_failure "No se pudo consultar jobs pendientes." "check_pending"
    goto WORKER_FATAL
)

if /I "!PENDING!"=="1" goto HAVE_JOB

call :log INFO "No hay jobs pendientes. Esperando %IDLE_TIMEOUT_SECONDS% segundos por una peticion nueva."
call :heartbeat "IDLE"
timeout /t %IDLE_TIMEOUT_SECONDS% /nobreak >nul

call :check_pending
if /I "!PENDING!"=="ERROR" (
    call :report_failure "No se pudo consultar jobs pendientes despues de la espera." "check_pending"
    goto WORKER_FATAL
)

if /I "!PENDING!"=="1" (
    call :log INFO "Llego un job durante la espera. Se inicia el ciclo."
    goto HAVE_JOB
)

call :log INFO "No se recibio una peticion nueva. Apagando instancia (prueba: no se apaga nada)."
call :request_shutdown

if "%AWS_AUTO_SHUTDOWN%"=="1" goto WORKER_END

call :log INFO "AWS_AUTO_SHUTDOWN=0. El worker sigue en espera para pruebas locales."
goto WORKER_LOOP


:HAVE_JOB

call :log SUCCESS "Hay jobs pendientes. Iniciando BlueZone."
call :heartbeat "STARTING"
call :wait_step

call :ensure_bluezone_closed
if errorlevel 1 (
    call :report_failure "No se pudo cerrar BlueZone antes de iniciar el job." "ensure_bluezone_closed"
    goto WORKER_FATAL
)

call :start_bluezone
if errorlevel 1 (
    call :report_failure "No fue posible iniciar BlueZone." "start_bluezone"
    goto WORKER_FATAL
)

call :heartbeat "RUNNING"
call :wait_script_finished
if errorlevel 1 (
    call :report_failure "El JS no termino el job correctamente." "wait_script_finished"
    goto BLUEZONE_ERROR
)

call :log SUCCESS "El JS termino el job. Nest reporta COMPLETED."
call :heartbeat "COMPLETED"

call :log INFO "Cerrando BlueZone al terminar el job."
call :close_bluezone
if errorlevel 1 (
    call :report_failure "BlueZone no pudo cerrarse despues del job." "close_bluezone"
    goto WORKER_FATAL
)

call :heartbeat "IDLE"
call :log SUCCESS "Ciclo de job completado. Se revisa si hay otro job."
goto WORKER_LOOP


REM ========================================================
REM ARCHIVOS: locales o descarga desde Nest
REM ========================================================

:ensure_files

if not exist "%RUTA_SCRIPTS%" (
    call :log INFO "Creando carpeta de Scripts: %RUTA_SCRIPTS%"
    mkdir "%RUTA_SCRIPTS%" >nul 2>&1
)
if not exist "%RUTA_SCRIPTS%" (
    call :log ERROR "No se pudo crear la carpeta de Scripts."
    exit /b 1
)

call :ensure_file "%RUTA_ORIGEN%%SCRIPT_NAME%" "%URL_SCRIPT%" "script BlueZone"
if errorlevel 1 exit /b 1

copy /Y "%RUTA_ORIGEN%%SCRIPT_NAME%" "%RUTA_SCRIPTS%\%SCRIPT_NAME%" >nul
if errorlevel 1 (
    call :log ERROR "No se pudo copiar el script a %RUTA_SCRIPTS%"
    exit /b 1
)
call :log SUCCESS "Script listo en %RUTA_SCRIPTS%\%SCRIPT_NAME%"
call :wait_step

set "BZLP_FILE="D:\Downloads\%BZLP_NAME%
if exist "%RUTA_ORIGEN%%BZLP_NAME%" set "BZLP_FILE=%RUTA_ORIGEN%%BZLP_NAME%"
if not defined BZLP_FILE if exist "D:\Downloads\%BZLP_NAME%" (
    copy /Y "D:\Downloads\%BZLP_NAME%" "%RUTA_ORIGEN%%BZLP_NAME%" >nul
    set "BZLP_FILE=%RUTA_ORIGEN%%BZLP_NAME%"
    call :log INFO "bzw2h.bzlp copiado desde D:\Downloads."
)
if not defined BZLP_FILE (
    call :ensure_file "%RUTA_ORIGEN%%BZLP_NAME%" "%URL_BZLP%" "bzw2h.bzlp"
    if errorlevel 1 (
        call :log ERROR "No se encontro bzw2h.bzlp local ni en Nest."
        exit /b 1
    )
    set "BZLP_FILE=%RUTA_ORIGEN%%BZLP_NAME%"
)
if not exist "%BZLP_FILE%" (
    call :log ERROR "bzw2h.bzlp no existe: %BZLP_FILE%"
    exit /b 1
)
call :log SUCCESS "bzw2h.bzlp listo: %BZLP_FILE%"
call :wait_step

if exist "%RUTA_ORIGEN%config\config.env" (
    copy /Y "%RUTA_ORIGEN%config\config.env" "%RUTA_SCRIPTS%\config.env" >nul
    if errorlevel 1 (
        call :log ERROR "No se pudo copiar config.env."
        exit /b 1
    )
    call :log SUCCESS "config.env copiado a Scripts."
) else (
    call :log INFO "No hay config.env junto al BAT. El JS usara el de Scripts si existe."
)
call :wait_step
exit /b 0


:ensure_file

set "DEST_FILE=%~1"
set "SRC_URL=%~2"
set "FILE_LABEL=%~3"

if exist "%DEST_FILE%" (
    call :log INFO "%FILE_LABEL% encontrado localmente."
    exit /b 0
)

call :log INFO "%FILE_LABEL% no esta local. Descargando desde Nest: %SRC_URL%"
curl -f -s -L -o "%DEST_FILE%" "%SRC_URL%"
if errorlevel 1 (
    call :log ERROR "Fallo la descarga de %FILE_LABEL%."
    if exist "%DEST_FILE%" del /Q "%DEST_FILE%" >nul 2>&1
    exit /b 1
)
if not exist "%DEST_FILE%" (
    call :log ERROR "La descarga de %FILE_LABEL% no dejo archivo."
    exit /b 1
)
call :log SUCCESS "%FILE_LABEL% actualizado desde Nest."
exit /b 0


REM ========================================================
REM INICIAR BLUEZONE
REM ========================================================

:start_bluezone

call :log INFO "=================================================="
call :log INFO "INICIANDO BLUEZONE WEB-TO-HOST"
call :log INFO "Perfil: %TERMINAL_ZMD%"
call :log INFO "ID: %TERMINAL_ID%"
call :log INFO "=================================================="
call :wait_step

call :log INFO "Ejecutando bzw2h.bzlp"
echo [PASO] "%BZLP_FILE%"

start "" "%BZLP_FILE%"

call :log INFO "Solicitud de apertura de bzw2h.bzlp enviada."
call :wait_step

call :log INFO "Esperando BlueZone Session Manager (bzsm.exe)."
set /a CONTADOR=0

:WAIT_SESSION_MANAGER
call :is_process_running "bzsm.exe"
if not errorlevel 1 (
    call :log SUCCESS "BlueZone Session Manager detectado."
    call :wait_step
    goto START_SESSION
)
set /a CONTADOR+=1
if !CONTADOR! GEQ %TIMEOUT_SESSION_MANAGER% (
    call :log ERROR "Timeout esperando BlueZone Session Manager."
    exit /b 1
)
echo Esperando Session Manager... !CONTADOR!/%TIMEOUT_SESSION_MANAGER%
timeout /t 1 /nobreak >nul
goto WAIT_SESSION_MANAGER

:START_SESSION
call :log INFO "Iniciando Session 1."
echo [PASO] "%RUTA_BZ_EXE%\BZMD.PRO" /f"%TERMINAL_ZMD%" /L"%TERMINAL_ID%" /ez3270D /u2 /@
call :wait_step

start "" /D "%RUTA_BZ_EXE%" "%RUTA_BZ_EXE%\BZMD.PRO" ^
    /f"%TERMINAL_ZMD%" ^
    /L"%TERMINAL_ID%" ^
    /ez3270D ^
    /u2 ^
    /@

if errorlevel 1 (
    call :log ERROR "No se pudo ejecutar Session 1 / BZMD.PRO."
    exit /b 1
)
call :log SUCCESS "Comando Session 1 ejecutado."
call :wait_step

call :log INFO "Esperando BZMD.PRO."
set /a CONTADOR=0

:WAIT_BLUEZONE
call :is_process_running "BZMD.PRO"
if not errorlevel 1 (
    call :log SUCCESS "BZMD.PRO detectado."
    call :wait_step
    goto BLUEZONE_READY
)
set /a CONTADOR+=1
if !CONTADOR! GEQ %TIMEOUT_BLUEZONE% (
    call :log ERROR "Timeout esperando BZMD.PRO."
    exit /b 1
)
echo Esperando BZMD.PRO... !CONTADOR!/%TIMEOUT_BLUEZONE%
timeout /t 1 /nobreak >nul
goto WAIT_BLUEZONE

:BLUEZONE_READY
echo.
echo ========================================================
echo        BLUEZONE INICIADO CORRECTAMENTE
echo Session Manager : OK
echo Session 1       : OK
echo BZMD.PRO        : OK
echo ========================================================
echo.
call :log SUCCESS "BLUEZONE INICIADO CORRECTAMENTE."
call :wait_step
exit /b 0


REM ========================================================
REM ESPERAR AL JS
REM ========================================================

:wait_script_finished

call :log INFO "Esperando que el JS termine el job en Nest (COMPLETED / ERROR)."
set /a WAITED=0
set /a STATUS_FAILS=0

:WAIT_SCRIPT_STATUS
set "STATUS="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r=Invoke-RestMethod -Uri '%URL_STATUS%?workerId=%WORKER_ID%' -Method Get; if ($null -eq $r.status) { 'UNKNOWN' } else { $r.status } } catch { exit 1 }"`) do (
    set "STATUS=%%A"
)

if not defined STATUS (
    set /a STATUS_FAILS+=1
    call :log ERROR "No se pudo consultar estado en Nest. Intento !STATUS_FAILS!/%STATUS_FAIL_MAX%"
    if !STATUS_FAILS! GEQ %STATUS_FAIL_MAX% (
        call :log ERROR "Se agotaron los reintentos consultando el estado del JS."
        exit /b 1
    )
    timeout /t %POLL_SECONDS% /nobreak >nul
    goto WAIT_SCRIPT_STATUS
)

set /a STATUS_FAILS=0

if /I "!STATUS!"=="COMPLETED" (
    call :log SUCCESS "Nest reporta COMPLETED. El JS termino el job."
    call :wait_step
    exit /b 0
)

if /I "!STATUS!"=="ERROR" (
    call :log ERROR "Nest reporta ERROR. El JS termino el job con fallo."
    call :wait_step
    exit /b 1
)

set /a WAITED+=%POLL_SECONDS%
echo [INFO] JS en proceso. Estado=!STATUS! Tiempo=!WAITED!/%SCRIPT_WAIT_TIMEOUT%s
if !WAITED! GEQ %SCRIPT_WAIT_TIMEOUT% (
    call :log ERROR "Timeout esperando que el JS termine el job."
    exit /b 1
)
timeout /t %POLL_SECONDS% /nobreak >nul
goto WAIT_SCRIPT_STATUS


REM ========================================================
REM CERRAR BLUEZONE (siempre)
REM Orden: BZMD.PRO -> BZMP.PRO -> bzsm.exe
REM ========================================================

:close_bluezone
call :kill_bluezone
call :verify_bluezone_closed
if errorlevel 1 (
    call :log ERROR "Uno o mas procesos BlueZone siguen activos despues del cierre."
    exit /b 1
)
call :log SUCCESS "BlueZone cerrado completamente."
call :wait_step
exit /b 0


:ensure_bluezone_closed
call :verify_bluezone_closed
if not errorlevel 1 (
    call :log INFO "No hay procesos BlueZone activos."
    exit /b 0
)

call :log INFO "Se detectaron procesos BlueZone. Cerrandolos."
set /a ENSURE_TRY=0

:ENSURE_RETRY
call :kill_bluezone
call :verify_bluezone_closed
if not errorlevel 1 (
    call :log SUCCESS "BlueZone quedo cerrado."
    exit /b 0
)

set /a ENSURE_TRY+=1
if !ENSURE_TRY! GEQ %CLOSE_RETRIES% (
    call :log ERROR "No se pudo cerrar BlueZone despues de %CLOSE_RETRIES% intentos."
    exit /b 1
)
call :log ERROR "BlueZone sigue activo. Reintento !ENSURE_TRY!/%CLOSE_RETRIES%."
goto ENSURE_RETRY


:kill_bluezone
call :log INFO "Cerrando BZMD.PRO"
call :kill_process "BZMD.PRO"
call :wait_step
call :log INFO "Cerrando BZMP.PRO"
call :kill_process "BZMP.PRO"
call :wait_step
call :log INFO "Cerrando bzsm.exe"
call :kill_process "bzsm.exe"
call :wait_step
exit /b 0


:verify_bluezone_closed
call :is_process_running "BZMD.PRO"
if not errorlevel 1 (
    call :log ERROR "Proceso BlueZone activo: BZMD.PRO"
    exit /b 1
)
call :is_process_running "BZMP.PRO"
if not errorlevel 1 (
    call :log ERROR "Proceso BlueZone activo: BZMP.PRO"
    exit /b 1
)
call :is_process_running "bzsm.exe"
if not errorlevel 1 (
    call :log ERROR "Proceso BlueZone activo: bzsm.exe"
    exit /b 1
)
exit /b 0


REM Detecta SOLO el proceso con ese ImageName exacto (no otros programas).
:is_process_running
set "CHECK_NAME=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq '%CHECK_NAME%' }).Count -gt 0) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %ERRORLEVEL%


:kill_process
set "KILL_NAME=%~1"
taskkill /IM "%KILL_NAME%" /F >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq '%KILL_NAME%' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
exit /b 0


REM ========================================================
REM NEST
REM ========================================================

:check_pending
set "PENDING=ERROR"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r=Invoke-RestMethod -Uri '%URL_PENDING%?workerId=%WORKER_ID%' -Method Get; if ($r.pending -eq $true) { '1' } elseif ($r.pending -eq $false) { '0' } else { 'ERROR' } } catch { 'ERROR' }"`) do (
    set "PENDING=%%A"
)
if /I "!PENDING!"=="1" (
    call :log INFO "Nest confirma jobs pendientes."
    exit /b 0
)
if /I "!PENDING!"=="0" (
    call :log INFO "Nest confirma que no hay jobs pendientes."
    exit /b 0
)
call :log ERROR "Respuesta invalida de jobs/pending: !PENDING!"
set "PENDING=ERROR"
exit /b 1


:heartbeat
set "HEARTBEAT_STATUS=%~1"
curl -s -S -X POST "%URL_HEARTBEAT%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"status\":\"%HEARTBEAT_STATUS%\"}" >nul 2>&1
if errorlevel 1 (
    call :log ERROR "No se pudo enviar heartbeat: %HEARTBEAT_STATUS%"
    exit /b 1
)
call :log INFO "Heartbeat enviado: %HEARTBEAT_STATUS%"
exit /b 0


:request_shutdown
call :log INFO "Enviando aviso de apagado de instancia a Nest (pruebas: no se apaga el equipo)."
curl -s -S -X POST "%URL_SHUTDOWN%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"reason\":\"IDLE_TIMEOUT\"}" >nul 2>&1
if errorlevel 1 (
    call :log ERROR "Nest no recibio el aviso de apagado de instancia."
    exit /b 1
)
if "%AWS_AUTO_SHUTDOWN%"=="1" (
    call :log SUCCESS "Aviso de apagado enviado. AWS_AUTO_SHUTDOWN=1, el worker termina."
) else (
    call :log SUCCESS "Aviso de apagado enviado. AWS_AUTO_SHUTDOWN=0, no se apaga nada."
)
exit /b 0


:report_failure
set "FAIL_MSG=%~1"
set "FAIL_STEP=%~2"
if "%FAIL_STEP%"=="" set "FAIL_STEP=desconocido"
call :log ERROR "%FAIL_MSG%"
call :log ERROR "Paso con error: %FAIL_STEP%"
call :heartbeat "ERROR"
curl -s -S -X POST "%URL_FAILURE%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"message\":\"%FAIL_MSG%\",\"step\":\"%FAIL_STEP%\",\"metadata\":{\"host\":\"%COMPUTERNAME%\"}}" >nul 2>&1
exit /b 0


:fatal
call :log ERROR "%~1"
goto WORKER_FATAL


:BLUEZONE_ERROR
call :log ERROR "Error durante el procesamiento BlueZone. Cerrando BlueZone."
call :heartbeat "ERROR"
call :close_bluezone
call :log ERROR "Worker detenido por error del JS. Tipo: procesamiento BlueZone."
goto RELEASE_ERROR


:WORKER_FATAL
call :log ERROR "ERROR FATAL DEL WORKER. Cerrando BlueZone."
call :heartbeat "ERROR"
call :close_bluezone
call :log ERROR "Worker detenido. No se reinicia el ciclo."
goto RELEASE_ERROR


:WORKER_END
call :log SUCCESS "WORKER BLUEZONE FINALIZADO"
endlocal
exit /b 0


:RELEASE_ERROR
echo.
echo ========================================================
echo       WORKER FINALIZADO POR ERROR
echo ========================================================
echo.
endlocal
exit /b 1


:wait_step
echo [ESPERA] %STEP_WAIT% segundos...
timeout /t %STEP_WAIT% /nobreak >nul
exit /b 0


:log
set "LVL=%~1"
set "MSG=%~2"
if /I "%LVL%"=="WARN" set "LVL=INFO"
echo [%LVL%] %MSG%
>>"%LOG_FILE%" echo [%LVL%] %MSG%
curl -s -S -X POST "%URL_LOG%" -H "Content-Type: application/json" --data-binary "{\"source\":\"Lanzador_Bluezone.bat\",\"level\":\"%LVL%\",\"message\":\"%MSG%\",\"workerId\":\"%WORKER_ID%\",\"host\":\"%COMPUTERNAME%\"}" >nul 2>&1
exit /b 0
