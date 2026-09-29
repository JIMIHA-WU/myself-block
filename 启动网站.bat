@echo off
rem ============================================================
rem  Ja's Hut (myself-block) -- local preview launcher
rem
rem  Double-click this file to start the local web server and
rem  open the site in your default browser.
rem
rem  URL  : http://localhost:8000/client/
rem  Stop : press Ctrl+C in this window, or just close it.
rem
rem  Keep this file in the project ROOT. It is a LOCAL tool only:
rem  never copy it into client/, and never upload it to the site.
rem  "localhost" means "this computer" -- it is useless to visitors.
rem ============================================================

setlocal
cd /d "%~dp0"

rem Prefer "python" from PATH; fall back to the Anaconda install.
set "PY=python"
where python >nul 2>nul || set "PY=E:\anaconda3\python.exe"

echo.
echo   Ja's Hut -- local preview
echo   ------------------------------------------------------
echo   Home    : http://localhost:8000/client/
echo   A note  : http://localhost:8000/client/note.html?id=n1
echo   Stop    : press Ctrl+C, or close this window
echo   ------------------------------------------------------
echo.

start "" http://localhost:8000/client/

%PY% -m http.server 8000 --bind 127.0.0.1

endlocal
