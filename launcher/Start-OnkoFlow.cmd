@echo off
setlocal
title OnkoFlow - lokalni aplikace

set "ONKOFLOW_ROOT=%~dp0"
set "ONKOFLOW_NODE=%ONKOFLOW_ROOT%runtime\node.exe"
set "ONKOFLOW_SERVER=%ONKOFLOW_ROOT%launcher\server.mjs"

if not exist "%ONKOFLOW_NODE%" (
  echo CHYBA: Chybi runtime\node.exe.
  echo Rozbalte prosim cely OnkoFlow ZIP do jedne slozky.
  pause
  exit /b 1
)

if not exist "%ONKOFLOW_SERVER%" (
  echo CHYBA: Chybi launcher\server.mjs.
  echo Rozbalte prosim cely OnkoFlow ZIP do jedne slozky.
  pause
  exit /b 1
)

"%ONKOFLOW_NODE%" "%ONKOFLOW_SERVER%"
set "ONKOFLOW_EXIT=%ERRORLEVEL%"

if not "%ONKOFLOW_EXIT%"=="0" (
  echo.
  echo OnkoFlow byl ukoncen s chybou %ONKOFLOW_EXIT%.
  pause
)

exit /b %ONKOFLOW_EXIT%
