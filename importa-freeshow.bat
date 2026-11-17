@echo off
REM Aduce cantarile din FreeShow in aplicatia Bethlehem. FreeShow nu este modificat.
cd /d "%~dp0apps\local-hub"
node tools\import-freeshow.js "%USERPROFILE%\Documents\FreeShow\Shows"
pause
