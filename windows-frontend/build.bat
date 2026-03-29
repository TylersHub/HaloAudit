@echo off
echo HaloAudit Windows - Build Script
echo ================================

echo.
echo Checking Node.js version...
node --version
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo.
echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Building for production...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo Creating Windows installer...
call npm run dist:win
if %errorlevel% neq 0 (
    echo ERROR: Failed to create installer
    pause
    exit /b 1
)

echo.
echo ================================
echo Build completed successfully!
echo.
echo Installer created in: release/
echo.
echo To test the app:
echo   npm run dev
echo.
pause



