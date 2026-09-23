@echo off
title AI Router — Setup Wizard
color 0B
cd /d "%~dp0"

echo.
echo  =============================================================
echo    Starting AI Router Interactive Setup Wizard...
echo  =============================================================
echo.

node setup.js
pause
