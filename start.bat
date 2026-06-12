@echo off
echo Starting server and webapp...

start "Server" cmd /k "cd /d "%~dp0server" && npm run dev"
timeout /t 2 /nobreak >nul
start "Webapp" cmd /k "cd /d "%~dp0webapp" && npm run dev"

echo Done! Two windows opened.
