#!/bin/bash

echo "HaloAudit Windows - Build Script"
echo "================================"

echo ""
echo "Checking Node.js version..."
node --version
if [ $? -ne 0 ]; then
    echo "ERROR: Node.js not found. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

echo ""
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi

echo ""
echo "Building for production..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi

echo ""
echo "Creating Windows installer..."
npm run dist:win
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to create installer"
    exit 1
fi

echo ""
echo "================================"
echo "Build completed successfully!"
echo ""
echo "Installer created in: release/"
echo ""
echo "To test the app:"
echo "  npm run dev"
echo ""



