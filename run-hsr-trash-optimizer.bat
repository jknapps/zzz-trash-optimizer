@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0run-hsr-trash-optimizer.ps1" %*
exit /b %errorlevel%
