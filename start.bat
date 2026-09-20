@echo off
REM Double-clickable launcher for Windows. All the logic lives in start.ps1,
REM so there is only one script to keep working.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
