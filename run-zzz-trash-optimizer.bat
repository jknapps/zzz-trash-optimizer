@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0run-zzz-trash-optimizer.ps1" %*
exit /b %errorlevel%
