@echo off
:: ========================================================
:: LANZADOR AVIS BOT - CON AUTO-ACTUALIZACION DE RED
:: ========================================================

:: 1. DEFINICION DE RUTAS
SET "RUTA_BZ_EXE=%USERPROFILE%\AppData\Local\Temp\BlueZone\7.1"
SET "RUTA_CERTS_USUARIO=%USERPROFILE%\Documents\BlueZone\Certs"
SET "RUTA_SCRIPTS=%USERPROFILE%\Documents\BlueZone\Scripts"
SET "RUTA_DOWNLOAD=%USERPROFILE%\Downloads"
SET "RUTA_ORIGEN=%~dp0"

:: --- CONFIGURACION DEL SERVIDOR (IMPORTANTE) ---
:: Cambia 'localhost' por la IP de tu servidor si lo usas en otras PC (ej: 192.168.1.50)
SET "URL_SCRIPT=http://localhost:88/Avis_bot/Script_Bluezone_a_Web.js"
SET "URL_TERMINAL=http://localhost:88/Avis_bot/Terminal.zmd"

:: --------------------------------------------------------
:: 2. AUTO-DESCARGA DE RECURSOS (La Magia)
:: --------------------------------------------------------
echo Verificando archivos locales...

:: Si el script JS no esta al lado del .bat, intentamos descargarlo del servidor
if not exist "%RUTA_ORIGEN%Script_Bluezone_a_Web (server).js" (
    echo [INFO] Descargando Script mas reciente del servidor...
    curl -s -o "%RUTA_ORIGEN%Script_Bluezone_a_Web (server).js" "%URL_SCRIPT%"
)

:: Si la Terminal .zmd no esta, la descargamos tambien
if not exist "%RUTA_ORIGEN%Terminal.zmd" (
    echo [INFO] Descargando configuracion de Terminal...
    curl -s -o "%RUTA_ORIGEN%Terminal.zmd" "%URL_TERMINAL%"
)

:: Verificacion final tras la descarga
if not exist "%RUTA_ORIGEN%Script_Bluezone_a_Web (server).js" (
    cls
    color 4F
    echo [ERROR FATAL] No se encuentra el script y fallo la descarga.
    echo Asegurate de que el servidor web este accesible en:
    echo %URL_SCRIPT%
    pause
    exit
)

:: --------------------------------------------------------
:: 3. INSTALACION EN DOCUMENTOS
:: --------------------------------------------------------
echo Actualizando scripts del usuario...
if not exist "%RUTA_SCRIPTS%" mkdir "%RUTA_SCRIPTS%"

:: Copiamos (ahora si existe seguro)
copy /Y "%RUTA_ORIGEN%Script_Bluezone_a_Web (server).js" "%RUTA_SCRIPTS%\Script_Bluezone_a_Web.js" >nul

:: --------------------------------------------------------
:: 4. INYECCION Y EJECUCION (Igual que antes)
:: --------------------------------------------------------
echo Inyectando configuracion...
copy /Y "%RUTA_ORIGEN%Terminal.zmd" "%RUTA_BZ_EXE%\Terminal.zmd" >nul
copy /Y "%RUTA_CERTS_USUARIO%\*.*" "%RUTA_BZ_EXE%\" >nul

echo Iniciando BlueZone...
cd /d "%RUTA_BZ_EXE%"
taskkill /IM bzmd.pro /F >nul 2>&1

start "" "BZMD.PRO" /f"Terminal.zmd" /S="Script_Bluezone_a_Web.js" /ez3270D /u2 /@ /s1

:: --------------------------------------------------------
:: 5. LIMPIEZA
:: --------------------------------------------------------
timeout /t 5 /nobreak >nul
del "%RUTA_BZ_EXE%\Terminal.zmd" /Q
del "%RUTA_DOWNLOAD%\lanzar_wpa.bat" /Q

exit
