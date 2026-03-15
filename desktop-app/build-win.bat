@echo off
REM Maestro POS Desktop - Build Script for Windows
REM Run this script on a Windows machine

echo ================================
echo   Maestro POS Desktop Builder
echo ================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if yarn is installed
where yarn >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing Yarn...
    npm install -g yarn
)

echo.
echo Step 1: Installing dependencies...
call yarn install

echo.
echo Step 2: Building Windows installer...
call yarn build:win

echo.
echo ================================
echo   Build Complete!
echo ================================
echo.
echo The installer is located in: dist\
echo Look for: Maestro POS Setup *.exe
echo.

pause
