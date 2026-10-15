@echo off
rem ============================================================
rem  Ja's Hut (myself-block) -- LAN preview launcher (phone)
rem
rem  Same as the classic launcher bat, but binds ALL network
rem  interfaces so your PHONE (on the same Wi-Fi) can open the site.
rem
rem  PC    : http://localhost:8000/client/
rem  Phone : http://<PC-LAN-IP>:8000/client/   (printed below)
rem  Stop  : press Ctrl+C in this window, or just close it.
rem
rem  Notes:
rem   - Phone and PC must be on the SAME Wi-Fi.
rem   - First run: Windows Firewall may pop up -- allow "Private
rem     networks" only. Do NOT keep this open on public Wi-Fi.
rem   - Keep this file in the project ROOT. Local tool only.
rem ============================================================

setlocal
cd /d "%~dp0"

rem Prefer "python" from PATH; fall back to the Anaconda install.
set "PY=python"
where python >nul 2>nul || set "PY=E:\anaconda3\python.exe"

rem ---- Detect the LAN IPv4 (prefer 192.168.x.x, else first non-loopback) ----
set "PCIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }; $w = $ips | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1; if (-not $w) { $w = $ips | Select-Object -First 1 }; $w.IPAddress"`) do set "PCIP=%%i"

echo.
echo   Ja's Hut -- LAN preview (for your phone)
echo   ------------------------------------------------------
echo   PC browser : http://localhost:8000/client/
if defined PCIP (
  echo   Phone      : http://%PCIP%:8000/client/
) else (
  echo   Phone      : http://YOUR-PC-IP:8000/client/
  echo                ^(run "ipconfig" and use the IPv4 192.168.x.x^)
)
echo   ------------------------------------------------------
echo   Same Wi-Fi required. Allow firewall on PRIVATE networks.
echo   Stop: press Ctrl+C, or close this window.
echo.

rem Optional: also open it locally so you can see it is running.
start "" http://localhost:8000/client/

%PY% -m http.server 8000 --bind 0.0.0.0

endlocal
