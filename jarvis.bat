@echo off
title JARVIS — Iniciando...
color 0B
cls

echo.
echo  ============================================
echo    J A R V I S   —   Sistema de inicio
echo  ============================================
echo.

:: ── Verificar Python ──────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [!] Python no encontrado.
    echo      Instala Python desde: https://python.org/downloads
    echo      Asegurate de marcar "Add Python to PATH"
    echo.
    pause
    exit /b
)

:: ── Pedir API key si no está guardada ─────────────────────────
if "%GEMINI_API_KEY%"=="" (
    echo  [!] No se encontro la API key de Gemini.
    echo.
    echo      Conseguila gratis en:
    echo      https://aistudio.google.com/app/apikey
    echo.
    set /p GEMINI_API_KEY="  Pega tu API key aqui y presiona Enter: "
    echo.

    if "!GEMINI_API_KEY!"=="" (
        echo  [!] No ingresaste ninguna key. Saliendo.
        pause
        exit /b
    )

    :: Guardar permanentemente en el sistema
    setx GEMINI_API_KEY "!GEMINI_API_KEY!" >nul
    echo  [OK] API key guardada. No vas a tener que ingresarla de nuevo.
    echo.
) else (
    echo  [OK] API key encontrada.
    echo.
)

:: ── Instalar dependencias si no están ─────────────────────────
echo  [1/3] Verificando dependencias Python...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo        Instalando ^(primera vez, puede tardar un minuto^)...
    pip install fastapi uvicorn httpx pyautogui pyttsx3 >nul 2>&1
    echo        Dependencias instaladas.
) else (
    echo        Dependencias OK.
)

:: ── Verificar ngrok ───────────────────────────────────────────
echo  [2/3] Verificando ngrok...
ngrok version >nul 2>&1
if errorlevel 1 (
    :: Buscar ngrok.exe en la carpeta actual
    if exist "ngrok.exe" (
        echo        ngrok.exe encontrado en carpeta actual.
        set PATH=%PATH%;%CD%
    ) else (
        echo.
        echo  [!] ngrok no encontrado.
        echo      Descargalo desde: https://ngrok.com/download
        echo      Descomprime ngrok.exe en esta misma carpeta y volvé a correr este archivo.
        echo.
        pause
        exit /b
    )
)

:: ── Verificar main.py ─────────────────────────────────────────
echo  [3/3] Verificando main.py...
if not exist "main.py" (
    echo.
    echo  [!] No se encontro main.py en esta carpeta.
    echo      Asegurate que jarvis.bat y main.py esten en la misma carpeta.
    echo.
    pause
    exit /b
)
echo        main.py OK.
echo.

:: ── Levantar todo ─────────────────────────────────────────────
echo  Iniciando JARVIS...
echo.
start "JARVIS Backend" cmd /k "color 0B && set GEMINI_API_KEY=%GEMINI_API_KEY% && python main.py"
timeout /t 3 /nobreak >nul
start "JARVIS ngrok" cmd /k "color 0B && ngrok http 8000"

cls
echo.
echo  ============================================
echo    J A R V I S   —   En linea
echo  ============================================
echo.
echo  Dos ventanas se abrieron:
echo   - JARVIS Backend: el motor de IA corriendo
echo   - JARVIS ngrok:   el tunel a internet
echo.
echo  Pasos finales:
echo   1. Mira la ventana de ngrok
echo   2. Copia la URL que dice "Forwarding"
echo      Ej: https://abcd-1234.ngrok-free.app
echo   3. Pega esa URL en el banner de la web
echo   4. Click en CONECTAR
echo.
echo  Deja las dos ventanas abiertas mientras uses JARVIS.
echo  Presiona cualquier tecla para cerrar esta ventana.
echo.
pause >nul
