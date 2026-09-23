@echo off
title Stop AI Services
color 0C

echo.
echo  AI Router + FreeLLM band ho rahi hain...
echo.
pm2 delete freellm
pm2 delete ai-router
echo.
echo  Dono services band ho gayi!
echo.
pause
