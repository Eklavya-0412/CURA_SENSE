@echo off
setlocal enabledelayedexpansion
title CURA_SENSE / MigraGuard Launcher

cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" launch.py %*
) else (
    where uv >nul 2>nul
    if !errorlevel! equ 0 (
        uv run python launch.py %*
    ) else (
        python launch.py %*
    )
)

endlocal
