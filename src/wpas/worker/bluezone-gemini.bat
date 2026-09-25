@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ========================================================
REM WORKER - NEST + BLUEZONE WEB-TO-HOST (VERSION ANTI-BLOQUEOS)
REM ========================================================

REM --- CONFIGURACION GENERAL ---
set "WORKER_ID=%COMPUTERNAME%"
REM TEST_VERSION=1 (Pruebas: No avisa a Nest para apagar la instancia)
REM TEST_VERSION=0 (Produccion: Envia aviso a Nest para apagar)
set "TEST_VERSION=0" 

if not defined WPAS_API_BASE set "WPAS_API_BASE=https://personal-pittsburgh-idle-growth.trycloudflare.com/api/sync"

REM --- RUTAS Y ARCHIVOS ---
set "RUTA_BZ_EXE=%USERPROFILE%\AppData\Local\Temp\BlueZone\7.1"
REM Ruta personalizada y exclusiva para validacion local
set "BZLP_FILE=D:\Downloads\bzw2h.bzlp"

REM Ruta universal de Scripts
set "RUTA_SCRIPTS=%USERPROFILE%\OneDrive\Documentos\BlueZone\Scripts"
if not exist "%RUTA_SCRIPTS%" set "RUTA_SCRIPTS=%USERPROFILE%\Documentos\BlueZone\Scripts"
if not exist "%RUTA_SCRIPTS%" set "RUTA_SCRIPTS=%USERPROFILE%\Documents\BlueZone\Scripts"

REM URLs de la API
set "URL_PENDING=%WPAS_API_BASE%/wpa/worker/jobs/pending"
set "URL_STATUS=%WPAS_API_BASE%/wpa/worker/status"
set "URL_SHUTDOWN=%WPAS_API_BASE%/wpa/worker/shutdown"
set "URL_SCRIPT=%WPAS_API_BASE%/wpa/worker/resources/script.js"
set "URL_ENV=%WPAS_API_BASE%/wpa/worker/resources/config.env"
set "URL_LOG=%WPAS_API_BASE%/wpa/worker/logs"
set "URL_HEARTBEAT=%WPAS_API_BASE%/wpa/worker/heartbeat"

REM Log local
set "LOG_FILE=%~dp0Lanzador_Bluezone.log"

REM Variables de Sesion de BlueZone
set "TERMINAL_ZMD=INTL-mod2(A)-LAC-v1PTLS.zmd"
set "TERMINAL_ID=DWT0HB2E"

REM Tiempos de espera (en segundos)
set "IDLE_TIMEOUT=30"
set "JS_WAIT_TIMEOUT=900" 
set "MAX_RESTARTS=3"
set "POLL_SECONDS=5"
set "TIMEOUT_STARTUP=30"

call :LOG INFO "========================================="
call :LOG INFO "Iniciando Worker ID: %WORKER_ID%"

REM Limpieza inicial forzosa de procesos fantasma
taskkill /IM "find.exe" /F /T >nul 2>&1
taskkill /IM "findstr.exe" /F /T >nul 2>&1

REM ========================================================
REM 1. VERIFICACION INICIAL
REM ========================================================

REM Validar que BlueZone exista
if not exist "%RUTA_BZ_EXE%\BZMD.PRO" (
    call :LOG ERROR "No se encontro BZMD.PRO."
    goto :TRIGGER_ERROR
)

REM Asegurar que BlueZone este cerrado antes de empezar
call :CLOSE_BLUEZONE

REM Validar archivo bzlp
if not exist "%BZLP_FILE%" (
    call :LOG ERROR "El archivo no existe localmente en %BZLP_FILE%"
    goto :TRIGGER_ERROR
)

REM Crear carpeta de scripts
if not exist "%RUTA_SCRIPTS%" mkdir "%RUTA_SCRIPTS%"

REM Verificar JS y ENV localmente
call :ENSURE_FILE "%RUTA_SCRIPTS%\Script_Bluezone_a_Web (server)_AWS.js" "%URL_SCRIPT%"
if errorlevel 1 goto :TRIGGER_ERROR

call :ENSURE_FILE "%RUTA_SCRIPTS%\config.env" "%URL_ENV%"
if errorlevel 1 goto :TRIGGER_ERROR

call :LOG INFO "Todos los archivos verificados correctamente."
call :heartbeat "ONLINE"

REM ========================================================
REM 2. CICLO PRINCIPAL (Busqueda de Jobs)
REM ========================================================
:WORKER_LOOP

call :LOG INFO "Consultando jobs pendientes en Nest..."
call :CHECK_PENDING
if "%PENDING_ERROR%"=="1" goto :TRIGGER_ERROR
if "%HAS_JOB%"=="1" goto :EJECUTAR_TRABAJO

REM Si no hay job inicialmente, pasa al temporizador
call :LOG INFO "No hay jobs. Esperando %IDLE_TIMEOUT% segundos..."
timeout /t %IDLE_TIMEOUT% /nobreak >nul

REM Revisar por segunda vez tras acabar el tiempo
call :heartbeat "IDLE"
call :CHECK_PENDING
if "%PENDING_ERROR%"=="1" goto :TRIGGER_ERROR
if "%HAS_JOB%"=="1" goto :EJECUTAR_TRABAJO

REM Si sigue sin haber job:
call :LOG INFO "No se recibio algun trabajo. Finalizando Worker..."
call :CLOSE_BLUEZONE
exit /b 0

:EJECUTAR_TRABAJO
call :PROCESS_JOB
if errorlevel 1 goto :TRIGGER_ERROR
goto :WORKER_LOOP


REM ========================================================
REM 3. PROCESAMIENTO DEL JOB
REM ========================================================
:PROCESS_JOB
call :LOG INFO "Job encontrado. Iniciando secuencia de BlueZone..."
call :CLOSE_BLUEZONE

call :START_BLUEZONE
if errorlevel 1 (
    call :LOG ERROR "No se pudo iniciar BlueZone correctamente."
    exit /b 1
)

call :LOG INFO "Dando 10 segundos para que el JS inicie correctamente..."
timeout /t 10 /nobreak >nul

call :LOG INFO "Supervisando ejecucion del script JS..."
call :WAIT_FOR_JS
if errorlevel 1 exit /b 1

call :LOG INFO "El worker JS finalizo el trabajo correctamente. Cerrando procesos..."
call :CLOSE_BLUEZONE

call :LOG INFO "Limpieza de BlueZone completada. Reiniciando ciclo de busqueda..."
timeout /t 3 /nobreak >nul
exit /b 0


REM ========================================================
REM FUNCIONES DE APOYO
REM ========================================================

:LOG
set "LVL=%~1"
set "MSG=%~2"
set "LOG_TIMESTAMP=%DATE% %TIME%"
echo [%LOG_TIMESTAMP%] [%LVL%] %MSG%
>>"%LOG_FILE%" echo [%LOG_TIMESTAMP%] [%LVL%] %MSG%
curl -s -S -X POST "%URL_LOG%" -H "Content-Type: application/json" --data-binary "{\"source\":\"Lanzador_Bluezone.bat\",\"level\":\"%LVL%\",\"message\":\"[%LOG_TIMESTAMP%] %MSG%\",\"workerId\":\"%WORKER_ID%\",\"host\":\"%COMPUTERNAME%\"}" >nul 2>&1
exit /b 0


:IS_PROCESS_RUNNING
REM Usa PowerShell nativo sin tuberias para evitar ventanas huerfanas
set "PROC_NAME=%~1"
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='%PROC_NAME%'\" -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %ERRORLEVEL%


:START_BLUEZONE
call :LOG INFO "Lanzando archivo bzlp (Session Manager)..."
start "" "%BZLP_FILE%"

set /a "CONTADOR_BZSM=0"
:WAIT_BZSM
call :IS_PROCESS_RUNNING "bzsm.exe"
if not errorlevel 1 (
    call :LOG INFO "Session Manager (bzsm.exe) detectado."
    goto :START_TERMINAL
)
set /a "CONTADOR_BZSM+=1"
if !CONTADOR_BZSM! GEQ %TIMEOUT_STARTUP% (
    call :LOG ERROR "Timeout esperando a que inicie Session Manager."
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto :WAIT_BZSM

:START_TERMINAL
call :LOG INFO "Iniciando terminal (BZMD.PRO)..."
start "" /D "%RUTA_BZ_EXE%" "%RUTA_BZ_EXE%\BZMD.PRO" /f"%TERMINAL_ZMD%" /L"%TERMINAL_ID%" /ez3270D /u2 /@

set /a "CONTADOR_BZMD=0"
:WAIT_BZMD
call :IS_PROCESS_RUNNING "BZMD.PRO"
if not errorlevel 1 (
    call :LOG INFO "Terminal BlueZone (BZMD.PRO) iniciada y lista."
    exit /b 0
)
set /a "CONTADOR_BZMD+=1"
if !CONTADOR_BZMD! GEQ %TIMEOUT_STARTUP% (
    call :LOG ERROR "Timeout esperando a que inicie la terminal BlueZone."
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto :WAIT_BZMD


:WAIT_FOR_JS
call :heartbeat "STARTING"
set /a "TIME_WAITED=0"
set /a "RESTARTS=0"

:WAIT_JS_LOOP
set "JOB_STATUS=ERROR_API"
for /f "delims=" %%A in ('powershell -NoProfile -Command "try { $r=Invoke-RestMethod -Uri '%URL_STATUS%?workerId=%WORKER_ID%'; if ($r.jobStatus) { $r.jobStatus } else { $r.status } } catch { 'ERROR_API' }"') do (
    set "JOB_STATUS=%%A"
)

call :LOG INFO "Estado consultado en Nest: %JOB_STATUS%"

if /I "%JOB_STATUS%"=="ERROR_API" (
    call :LOG ERROR "Error al consultar status en Nest."
    exit /b 1
)
call :heartbeat "ONLINE"
if /I "%JOB_STATUS%"=="COMPLETED" exit /b 0
if /I "%JOB_STATUS%"=="ERROR" (
    call :LOG ERROR "JS reporta fallo en el Job."
    exit /b 1
)

set /a "TIME_WAITED+=%POLL_SECONDS%"
if !TIME_WAITED! GEQ %JS_WAIT_TIMEOUT% (
    set /a "RESTARTS+=1"
    set /a "TIME_WAITED=0"
    call :LOG WARN "Temporizador JS agotado. Se reinicia contador: !RESTARTS!/%MAX_RESTARTS%"
    
    if !RESTARTS! GEQ %MAX_RESTARTS% (
        call :LOG ERROR "Temporizador de JS reiniciado 3 veces. Abortando proceso."
        exit /b 1
    )
)
timeout /t %POLL_SECONDS% /nobreak >nul
goto :WAIT_JS_LOOP


:CHECK_PENDING
set "HAS_JOB=0"
set "PENDING_ERROR=0"
for /f "delims=" %%A in ('powershell -NoProfile -Command "try { $r=Invoke-RestMethod -Uri '%URL_PENDING%?workerId=%WORKER_ID%'; if ($r.pending -eq $true) { '1' } else { '0' } } catch { 'ERROR' }"') do (
    set "RES=%%A"
)
if "%RES%"=="ERROR" set "PENDING_ERROR=1"
if "%RES%"=="1" set "HAS_JOB=1"
exit /b


:ENSURE_FILE
set "FILE_PATH=%~1"
set "FILE_URL=%~2"
if exist "%FILE_PATH%" (
    call :LOG INFO "Archivo verificado localmente: %FILE_PATH%"
    exit /b 0
)
call :LOG INFO "Descargando %FILE_PATH% desde Nest..."
curl -f -s -L -o "%FILE_PATH%" "%FILE_URL%"
if errorlevel 1 (
    call :LOG ERROR "No se pudo descargar el archivo."
    if exist "%FILE_PATH%" del /Q "%FILE_PATH%" >nul 2>&1
    exit /b 1
)
exit /b 0


:CLOSE_BLUEZONE
taskkill /IM "BZMD.PRO" /F /T >nul 2>&1
taskkill /IM "BZMP.PRO" /F /T >nul 2>&1
taskkill /IM "bzsm.exe" /F /T >nul 2>&1
REM Elimina fantasmas
taskkill /IM "find.exe" /F /T >nul 2>&1
taskkill /IM "findstr.exe" /F /T >nul 2>&1
timeout /t 1 /nobreak >nul
exit /b 0

:heartbeat
set "HEARTBEAT_STATUS=%~1"
curl -s -S -X POST "%URL_HEARTBEAT%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"status\":\"%HEARTBEAT_STATUS%\"}" >nul 2>&1
if errorlevel 1 (
    call :log ERROR "No se pudo enviar heartbeat: %HEARTBEAT_STATUS%"
    exit /b 1
)
call :log INFO "Heartbeat enviado: %HEARTBEAT_STATUS%"
exit /b 0

REM ========================================================
REM FUNCION DE ERROR (Flujo centralizado)
REM ========================================================
:TRIGGER_ERROR
call :LOG ERROR "Invocando funcion de error maestra..."
call :CLOSE_BLUEZONE

if "%TEST_VERSION%"=="1" (
    call :LOG INFO "Version de prueba activa: NO se envia el aviso de apagado de instancia."
) else (
    call :LOG INFO "Enviando aviso a Nest para apagar la instancia..."
    curl -s -S -X POST "%URL_SHUTDOWN%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"reason\":\"FATAL_ERROR\"}" >nul 2>&1
)

call :heartbeat "ERROR"
call :LOG INFO "Terminando worker y BAT debido a un error."
exit /b 1