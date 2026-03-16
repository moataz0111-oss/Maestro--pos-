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

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "Node.js version: $(node -v)"
if [ "$NODE_VERSION" -gt 22 ]; then
    echo "WARNING: Node.js v24+ may cause issues with native modules."
    echo "Recommended: Use Node.js v20 (LTS)"
    echo "Install with: brew install node@20"
    echo ""
fi

# Check if yarn is installed
if ! command -v yarn &> /dev/null; then
    echo "Installing Yarn..."
    npm install -g yarn
fi

echo ""
echo "Step 1: Creating macOS icon (.icns)..."

# Check if icon.png exists
if [ ! -f "assets/icon.png" ]; then
    echo "ERROR: assets/icon.png not found!"
    exit 1
fi

# Create iconset directory
ICONSET_DIR="assets/icon.iconset"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# Generate all required icon sizes using sips
echo "  - Generating icon sizes..."
sips -z 16 16     "assets/icon.png" --out "$ICONSET_DIR/icon_16x16.png" > /dev/null 2>&1
sips -z 32 32     "assets/icon.png" --out "$ICONSET_DIR/icon_16x16@2x.png" > /dev/null 2>&1
sips -z 32 32     "assets/icon.png" --out "$ICONSET_DIR/icon_32x32.png" > /dev/null 2>&1
sips -z 64 64     "assets/icon.png" --out "$ICONSET_DIR/icon_32x32@2x.png" > /dev/null 2>&1
sips -z 128 128   "assets/icon.png" --out "$ICONSET_DIR/icon_128x128.png" > /dev/null 2>&1
sips -z 256 256   "assets/icon.png" --out "$ICONSET_DIR/icon_128x128@2x.png" > /dev/null 2>&1
sips -z 256 256   "assets/icon.png" --out "$ICONSET_DIR/icon_256x256.png" > /dev/null 2>&1
sips -z 512 512   "assets/icon.png" --out "$ICONSET_DIR/icon_256x256@2x.png" > /dev/null 2>&1
sips -z 512 512   "assets/icon.png" --out "$ICONSET_DIR/icon_512x512.png" > /dev/null 2>&1
sips -z 1024 1024 "assets/icon.png" --out "$ICONSET_DIR/icon_512x512@2x.png" > /dev/null 2>&1

# Convert iconset to icns
echo "  - Converting to .icns format..."
iconutil -c icns "$ICONSET_DIR" -o "assets/icon.icns"

# Cleanup iconset directory
rm -rf "$ICONSET_DIR"

if [ -f "assets/icon.icns" ]; then
    echo "  ✓ Icon created successfully: assets/icon.icns"
else
    echo "  ✗ ERROR: Failed to create icon.icns"
    exit 1
fi

echo ""
echo "Step 2: Installing dependencies..."
yarn install

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to install dependencies!"
    echo ""
    echo "If you see errors with 'better-sqlite3', try:"
    echo "  1. Use Node.js v20: brew install node@20"
    echo "  2. Then run: export PATH=\"/usr/local/opt/node@20/bin:\$PATH\""
    echo "  3. And run this script again"
    exit 1
fi

echo ""
echo "Step 3: Building macOS installer..."
yarn build:mac

if [ $? -eq 0 ]; then
    echo ""
    echo "================================"
    echo "  ✓ Build Complete!"
    echo "================================"
    echo ""
    echo "The installer is located in: dist/"
    echo "Look for: Maestro POS-*.dmg"
    echo ""
    ls -la dist/*.dmg 2>/dev/null
else
    echo ""
    echo "================================"
    echo "  ✗ Build Failed!"
    echo "================================"
    echo ""
    echo "Check the error messages above for details."
fi
