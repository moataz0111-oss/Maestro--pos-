#!/bin/bash
# Maestro POS Desktop - Build Script for macOS
# Run this script on a Mac

echo "================================"
echo "  Maestro POS Desktop Builder"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if yarn is installed
if ! command -v yarn &> /dev/null; then
    echo "Installing Yarn..."
    npm install -g yarn
fi

echo ""
echo "Step 1: Installing dependencies..."
yarn install

echo ""
echo "Step 2: Building macOS installer..."
yarn build:mac

echo ""
echo "================================"
echo "  Build Complete!"
echo "================================"
echo ""
echo "The installer is located in: dist/"
echo "Look for: Maestro POS-*.dmg"
echo ""
