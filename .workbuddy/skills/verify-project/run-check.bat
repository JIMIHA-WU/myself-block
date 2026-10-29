@echo off
REM ============================================================
REM  verify-project launcher  (myself-block pre-release check)
REM  Why this file exists: Windows CMD defaults to GBK (cp936),
REM  so UTF-8 Chinese output from Node would show as garbage.
REM  Switching to cp65001 first makes the report readable.
REM  Usage:  run-check.bat  [--only=A] [--selftest] [--no-history] [--json]
REM ============================================================
chcp 65001 >nul

where node >nul 2>nul
if %errorlevel%==0 (
  node "%~dp0check.js" %*
  exit /b %errorlevel%
)

if exist "D:\node.exe" (
  "D:\node.exe" "%~dp0check.js" %*
  exit /b %errorlevel%
)

echo [ERROR] Node.js not found. Install Node.js, or edit this file to point at node.exe.
exit /b 2
