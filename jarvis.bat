@echo off
title JARVIS - Iniciando...
color 0B
cls

echo.
echo  ============================================
echo    J A R V I S   -   Sistema de inicio
echo  ============================================
echo.

:: ── Verificar Python ──────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  [!] Python no encontrado.
    pause
    exit /b
)

:: ── Pedir API key si no existe el archivo ─────────────────────
if not exist "api_key.txt" (
    echo  [!] No se encontro tu API key.
    echo.
    echo      Conseguila gratis en:
    echo      https://aistudio.google.com/app/apikey
    echo.
    set /p NEW_API_KEY="  Pega tu NUEVA API key aqui y presiona Enter: "
    
    :: Guardar en un archivo de texto (Seguro y a prueba de fallos)
    >api_key.txt echo !NEW_API_KEY!
    echo.
    echo  [OK] API key guardada en el archivo api_key.txt.
    echo.
) else (
    echo  [OK] Archivo api_key.txt encontrado.
    echo.
)

:: ── Instalar dependencias si no estan ─────────────────────────
echo  [1/3] Verificando dependencias Python...
pip show fastapi >nul 2>&1
if errorlevel 1 (
    echo        Instalando dependencias...
    pip install fastapi uvicorn httpx pyautogui pyttsx3 >nul 2>&1
)
echo        Dependencias OK.

:: ── Verificar ngrok ───────────────────────────────────────────
echo  [2/3] Verificando ngrok...
ngrok version >nul 2>&1
if errorlevel 1 (
    if exist "ngrok.exe" (
        set PATH=%PATH%;%CD%
        echo        ngrok.exe listo.
    ) else (
        echo  [!] ngrok no encontrado. Descargalo y ponelo en esta carpeta.
        pause
        exit /b
    )
) else (
    echo        ngrok OK.
)

:: ── Verificar main.py ─────────────────────────────────────────
echo  [3/3] Verificando main.py...
if not exist "main.py" (
    echo  [!] No se encontro main.py.
    pause
    exit /b
)
echo        main.py OK.
echo.

:: ── Levantar todo ─────────────────────────────────────────────
echo  Iniciando JARVIS...
echo.

start "JARVIS Backend" cmd /k "color 0B && python main.py"
timeout /t 3 /nobreak >nul
start "JARVIS ngrok" cmd /k "color 0B && ngrok http 8000"

cls
echo.
echo  ============================================
echo    J A R V I S   -   En linea
echo  ============================================
echo.
echo  1. Copia la URL de la ventana de ngrok (https://....ngrok-free.app)
echo  2. Pegala en tu web y dale a Conectar.
echo.
echo  Deja las ventanas abiertas. Presiona cualquier tecla para salir de aqui.
pause >nul