@echo off
title AI Services — Starting...
color 0A

echo.
echo  ================================================
echo    AI Router + FreeLLM — Starting Services
echo  ================================================
echo.

:: Pehle purani processes band karo
echo  Purani processes band kar raha hoon...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: FreeLLM ko alag minimized window mein chalao
echo  [1/2] FreeLLM API start ho raha hai (port 3001)...
start "FreeLLM API" /min cmd /k "cd /d C:\Users\basic\freellmapi && npm run dev"

:: 3 second wait
timeout /t 3 /nobreak >nul

:: AI Router ko alag minimized window mein chalao
echo  [2/2] AI Router start ho raha hai (port 3000)...
start "AI Router" /min cmd /k "cd /d C:\AI-Router && node index.js"

:: 4 second wait for startup
timeout /t 4 /nobreak >nul

echo.
echo  ================================================
echo.
echo   ✅ Dono services start ho gayi hain!
echo.
echo   AI Router : http://localhost:3000
echo   FreeLLM   : http://localhost:3001
echo.
echo   ⚠️  IMPORTANT: Taskbar mein 2 CMD windows
echo   dikhenge (FreeLLM API + AI Router)
echo   UNHE BAND MAT KARO — Services band ho jaengi!
echo   Sirf MINIMIZE karo (- button)
echo.
echo  ================================================
echo.
pause
