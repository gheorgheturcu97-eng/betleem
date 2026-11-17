@echo off
REM Porneste proiectia Bethlehem pe Windows. Schimba PIN-urile mai jos.
cd /d "%~dp0apps\local-hub"
if not exist node_modules call npm install
set PIN=1234
set LEADER_PIN=9999
start "" http://localhost:4545/control.html
node src\server.js
pause
