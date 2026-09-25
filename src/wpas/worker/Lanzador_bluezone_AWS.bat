@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ========================================================
REM WORKER - NEST + BLUEZONE WEB-TO-HOST (VERSION BLINDADA)
REM ========================================================

REM --- CONFIGURACION GENERAL ---
set "WORKER_ID=%COMPUTERNAME%"
REM TEST_VERSION=1 (Pruebas: No avisa a Nest para apagar la instancia)
REM TEST_VERSION=0 (Produccion: Envia aviso a Nest para apagar)
set "TEST_VERSION=0" 

if not defined WPAS_API_BASE set "WPAS_API_BASE=https://personal-pittsburgh-idle-growth.trycloudflare.com/api/sync"

REM --- RUTAS Y ARCHIVOS ---
@REM  set "RUTA_BZ_EXE=%USERPROFILE%\AppData\Local\Temp\BlueZone\7.1"
REM Ruta universal del archivo bzlp
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
taskkill /IM "findstr.exe" /F /T >nul 2>&1

REM ========================================================
REM 1. VERIFICACION INICIAL
REM ========================================================
call :CLOSE_BLUEZONE

REM Validar archivo bzlp (Ya no se pide BZMD.PRO al inicio)
if not exist "%BZLP_FILE%" goto :ERROR_BZLP
goto :VERIFY_SCRIPTS

:ERROR_BZLP
call :LOG ERROR "El archivo no existe localmente en %BZLP_FILE%"
goto :TRIGGER_ERROR

:VERIFY_SCRIPTS
REM Crear carpeta de scripts
if not exist "%RUTA_SCRIPTS%" mkdir "%RUTA_SCRIPTS%"

REM Verificar JS y ENV localmente
call :ENSURE_FILE "%RUTA_SCRIPTS%\Script_Bluezone_a_Web (server)_AWS.js" "%URL_SCRIPT%"
if errorlevel 1 goto :TRIGGER_ERROR

call :ENSURE_FILE "%RUTA_SCRIPTS%\config.env" "%URL_ENV%"
if errorlevel 1 goto :TRIGGER_ERROR

call :LOG INFO "Todos los archivos verificados correctamente."
call :HEARTBEAT "ONLINE"

REM ========================================================
REM 2. CICLO PRINCIPAL (Busqueda de Jobs)
REM ========================================================
:WORKER_LOOP

call :LOG INFO "Consultando jobs pendientes en Nest..."
call :CHECK_PENDING
if "%PENDING_ERROR%"=="1" goto :TRIGGER_ERROR
if "%HAS_JOB%"=="1" goto :PROCESS_JOB

REM Si no hay job inicialmente, pasa al temporizador
call :LOG INFO "No hay jobs. Esperando %IDLE_TIMEOUT% segundos..."
call :HEARTBEAT "IDLE"
timeout /t %IDLE_TIMEOUT% /nobreak >nul

REM Revisar por segunda vez tras acabar el tiempo
call :CHECK_PENDING
if "%PENDING_ERROR%"=="1" goto :TRIGGER_ERROR
if "%HAS_JOB%"=="1" goto :PROCESS_JOB

REM ========================================================
REM APAGADO POR INACTIVIDAD
REM ========================================================
call :LOG INFO "No se recibio algun trabajo. Finalizando Worker..."
call :CLOSE_BLUEZONE

if "%TEST_VERSION%"=="1" goto :SKIP_SHUTDOWN_IDLE

call :LOG INFO "Enviando aviso a Nest para apagar la instancia (Inactividad)..."
curl -s -S -X POST "%URL_SHUTDOWN%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"reason\":\"IDLE_TIMEOUT\"}" >nul 2>&1
goto :DO_EXIT

:SKIP_SHUTDOWN_IDLE
call :LOG INFO "Version de prueba activa: NO se envia el aviso de apagado de instancia."

:DO_EXIT
call :LOG INFO "Cerrando consola de forma definitiva para evitar reinicios..."
timeout /t 3 /nobreak >nul
exit


REM ========================================================
REM 3. PROCESAMIENTO DEL JOB
REM ========================================================
:PROCESS_JOB
call :LOG INFO "Job encontrado. Iniciando secuencia de BlueZone..."
call :HEARTBEAT "STARTING"
call :CLOSE_BLUEZONE

call :START_BLUEZONE
if errorlevel 1 goto :ERROR_START_BZ
goto :CONTINUE_JOB

:ERROR_START_BZ
call :LOG ERROR "No se pudo iniciar BlueZone correctamente."
goto :TRIGGER_ERROR

:CONTINUE_JOB
call :LOG INFO "Dando 10 segundos para que el JS inicie correctamente..."
timeout /t 10 /nobreak >nul

call :LOG INFO "Supervisando ejecucion del script JS..."
call :WAIT_FOR_JS
if errorlevel 1 goto :TRIGGER_ERROR

call :LOG INFO "El worker JS finalizo el trabajo correctamente. Cerrando procesos..."
call :HEARTBEAT "COMPLETED"
call :CLOSE_BLUEZONE

call :LOG INFO "Limpieza de BlueZone completada. Reiniciando ciclo de busqueda..."
timeout /t 3 /nobreak >nul
goto :WORKER_LOOP


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
goto :EOF


:HEARTBEAT
set "HEARTBEAT_STATUS=%~1"
curl -s -S -X POST "%URL_HEARTBEAT%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"status\":\"%HEARTBEAT_STATUS%\"}" >nul 2>&1
if errorlevel 1 goto :HEARTBEAT_ERROR
call :LOG INFO "Heartbeat enviado: %HEARTBEAT_STATUS%"
goto :EOF

:HEARTBEAT_ERROR
call :LOG ERROR "No se pudo enviar heartbeat: %HEARTBEAT_STATUS%"
goto :EOF


:IS_PROCESS_RUNNING
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='%~1'\" -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %ERRORLEVEL%


:START_BLUEZONE
call :LOG INFO "Lanzando archivo bzlp (Session Manager)..."
start "" "%BZLP_FILE%"
set /a "CONTADOR_BZSM=0"

:WAIT_BZSM
call :IS_PROCESS_RUNNING "bzsm.exe"
if not errorlevel 1 goto :BZSM_DETECTED
set /a "CONTADOR_BZSM+=1"
if !CONTADOR_BZSM! GEQ %TIMEOUT_STARTUP% goto :BZSM_TIMEOUT
timeout /t 1 /nobreak >nul
goto :WAIT_BZSM

:BZSM_TIMEOUT
call :LOG ERROR "Timeout esperando a que inicie Session Manager."
exit /b 1

:BZSM_DETECTED
call :LOG INFO "Session Manager (bzsm.exe) detectado."
call :LOG INFO "Iniciando terminal (BZMD.PRO)..."

REM ============================================================
REM 3. Detectar BZSM dinamicamente (nuevo)
REM ============================================================

echo Obteniendo ruta dinamica de BlueZone...

for /f "delims=" %%F in ('
    powershell -NoProfile -Command ^
    "$p=Get-Process bzsm -ErrorAction SilentlyContinue | Select-Object -First 1; if($p){$p.Path}"
') do set "BZSM_PATH=%%F"

if not defined BZSM_PATH (
    echo [ERROR] No se pudo obtener la ruta de bzsm.exe.
    echo.
    pause
    exit /b 1
)

for %%A in ("%BZSM_PATH%") do set "BZDIR=%%~dpA"

echo [OK] BZSM:
echo      %BZSM_PATH%
echo.

echo [OK] Directorio:
echo      %BZDIR%
echo.

REM ============================================================
REM 4. Detectar BZMD.PRO
REM ============================================================

echo [4/5] Buscando BZMD.PRO...

set "BZMD_PATH="

for /f "delims=" %%F in ('
    powershell -NoProfile -Command ^
    "$f=Get-ChildItem $env:TEMP\BlueZone -Filter BZMD.PRO -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1; if($f){$f.FullName}"
') do set "BZMD_PATH=%%F"

if not defined BZMD_PATH (
    echo [ERROR] No se encontro BZMD.PRO.
    echo.
    pause
    exit /b 1
)

for %%A in ("%BZMD_PATH%") do set "BZMD_DIR=%%~dpA"

echo [OK] BZMD.PRO:
echo      %BZMD_PATH%
echo.

echo [OK] Directorio de ejecucion:
echo      %BZMD_DIR%
echo.

REM ============================================================
REM 5. Ejecutar terminal
REM ============================================================

echo [5/5] Iniciando terminal BlueZone...
echo.

pushd "%BZMD_DIR%"

start "" "%BZMD_PATH%" /f"INTL-mod2(A)-LAC-v1PTLS.zmd" /L"DWT0HB2E" /ez3270D /u0 /@ /s5

popd

timeout /t 3 /nobreak >nul

REM ============================================================
REM Verificacion
REM ============================================================

tasklist /FI "IMAGENAME eq BZMD.PRO" 2>nul | find /I "BZMD.PRO" >nul

if errorlevel 1 (
    echo.
    echo [ERROR] BZMD.PRO no aparece ejecutandose.
    echo.
    pause
    exit /b 1
)
REM 3. Detectar BZSM dinamicamente (nuevo fin)

@REM  start "" /D "%RUTA_BZ_EXE%" "%RUTA_BZ_EXE%\BZMD.PRO" /f"%TERMINAL_ZMD%" /L"%TERMINAL_ID%" /ez3270D /u2 /@
@REM  set /a "CONTADOR_BZMD=0"

:WAIT_BZMD
call :IS_PROCESS_RUNNING "BZMD.PRO"
if not errorlevel 1 goto :BZMD_DETECTED
set /a "CONTADOR_BZMD+=1"
if !CONTADOR_BZMD! GEQ %TIMEOUT_STARTUP% goto :BZMD_TIMEOUT
timeout /t 1 /nobreak >nul
goto :WAIT_BZMD

:BZMD_TIMEOUT
call :LOG ERROR "Timeout esperando a que inicie la terminal BlueZone."
exit /b 1

:BZMD_DETECTED
call :LOG INFO "Terminal BlueZone (BZMD.PRO) iniciada y lista."
goto :EOF


:WAIT_FOR_JS
call :HEARTBEAT "STARTING"
set /a "TIME_WAITED=0"
set /a "RESTARTS=0"

:WAIT_JS_LOOP
set "JOB_STATUS=ERROR_API"
for /f "delims=" %%A in ('powershell -NoProfile -Command "try { $r=Invoke-RestMethod -Uri '%URL_STATUS%?workerId=%WORKER_ID%'; if ($r.jobStatus) { $r.jobStatus } else { $r.status } } catch { 'ERROR_API' }"') do (
    set "JOB_STATUS=%%A"
)
call :LOG INFO "Estado consultado en Nest: %JOB_STATUS%"

if /I "%JOB_STATUS%"=="ERROR_API" goto :JS_ERROR_API
if /I "%JOB_STATUS%"=="COMPLETED" goto :JS_COMPLETED
if /I "%JOB_STATUS%"=="ERROR" goto :JS_ERROR

call :HEARTBEAT "ONLINE"
set /a "TIME_WAITED+=%POLL_SECONDS%"
if !TIME_WAITED! GEQ %JS_WAIT_TIMEOUT% goto :JS_TIMEOUT_CHECK
timeout /t %POLL_SECONDS% /nobreak >nul
goto :WAIT_JS_LOOP

:JS_TIMEOUT_CHECK
set /a "RESTARTS+=1"
set /a "TIME_WAITED=0"
call :LOG WARN "Temporizador JS agotado. Se reinicia contador: !RESTARTS!/%MAX_RESTARTS%"
if !RESTARTS! GEQ %MAX_RESTARTS% goto :JS_FATAL_TIMEOUT
timeout /t %POLL_SECONDS% /nobreak >nul
goto :WAIT_JS_LOOP

:JS_ERROR_API
call :LOG ERROR "Error al consultar status en Nest."
exit /b 1

:JS_ERROR
call :LOG ERROR "JS reporta fallo en el Job."
exit /b 1

:JS_FATAL_TIMEOUT
call :LOG ERROR "Temporizador de JS reiniciado 3 veces. Abortando proceso."
exit /b 1

:JS_COMPLETED
goto :EOF


:CHECK_PENDING
set "HAS_JOB=0"
set "PENDING_ERROR=0"
for /f "delims=" %%A in ('powershell -NoProfile -Command "try { $r=Invoke-RestMethod -Uri '%URL_PENDING%?workerId=%WORKER_ID%'; if ($r.pending -eq $true) { '1' } else { '0' } } catch { 'ERROR' }"') do (
    set "RES=%%A"
)
if "%RES%"=="ERROR" set "PENDING_ERROR=1"
if "%RES%"=="1" set "HAS_JOB=1"
goto :EOF


:ENSURE_FILE
set "FILE_PATH=%~1"
set "FILE_URL=%~2"
if not exist "%FILE_PATH%" goto :DOWNLOAD_FILE
call :LOG INFO "Archivo verificado localmente: %FILE_PATH%"
goto :EOF

:DOWNLOAD_FILE
call :LOG INFO "Descargando %FILE_PATH% desde Nest..."
curl -f -s -L -o "%FILE_PATH%" "%FILE_URL%"
if errorlevel 1 goto :DOWNLOAD_ERROR
goto :EOF

:DOWNLOAD_ERROR
call :LOG ERROR "No se pudo descargar el archivo."
if exist "%FILE_PATH%" del /Q "%FILE_PATH%" >nul 2>&1
exit /b 1


:CLOSE_BLUEZONE
taskkill /IM "BZMD.PRO" /F /T >nul 2>&1
taskkill /IM "BZMP.PRO" /F /T >nul 2>&1
taskkill /IM "bzsm.exe" /F /T >nul 2>&1
timeout /t 1 /nobreak >nul
goto :EOF


REM ========================================================
REM FUNCION DE ERROR MAESTRA
REM ========================================================
:TRIGGER_ERROR
call :LOG ERROR "Invocando funcion de error maestra..."

REM Matar procesos directamente aqui para no usar subrutinas extra
taskkill /IM "BZMD.PRO" /F /T >nul 2>&1
taskkill /IM "BZMP.PRO" /F /T >nul 2>&1
taskkill /IM "bzsm.exe" /F /T >nul 2>&1
taskkill /IM "findstr.exe" /F /T >nul 2>&1

call :LOG INFO "Heartbeat enviado: ERROR"
curl -s -S -X POST "%URL_HEARTBEAT%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"status\":\"ERROR\"}" >nul 2>&1

if "%TEST_VERSION%"=="1" goto :SKIP_SHUTDOWN_ERROR

call :LOG INFO "Enviando aviso a Nest para apagar la instancia (Error Fatal)..."
curl -s -S -X POST "%URL_SHUTDOWN%" -H "Content-Type: application/json" --data-binary "{\"workerId\":\"%WORKER_ID%\",\"reason\":\"FATAL_ERROR\"}" >nul 2>&1
goto :DO_EXIT_ERROR

:SKIP_SHUTDOWN_ERROR
call :LOG INFO "Version de prueba activa: NO se envia el aviso de apagado de instancia."

:DO_EXIT_ERROR
call :LOG INFO "Terminando worker y BAT debido a un error."
timeout /t 3 /nobreak >nul
exit