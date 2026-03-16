#!/bin/bash
# Create macOS icon (.icns) from PNG
# Usage: ./create-mac-icon.sh

echo "Creating macOS icon (.icns)..."

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
echo "Generating icon sizes..."
sips -z 16 16     "assets/icon.png" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "assets/icon.png" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "assets/icon.png" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "assets/icon.png" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "assets/icon.png" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "assets/icon.png" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "assets/icon.png" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "assets/icon.png" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "assets/icon.png" --out "$ICONSET_DIR/icon_512x512.png"
sips -z 1024 1024 "assets/icon.png" --out "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to icns
echo "Converting to .icns format..."
iconutil -c icns "$ICONSET_DIR" -o "assets/icon.icns"

# Cleanup
rm -rf "$ICONSET_DIR"

if [ -f "assets/icon.icns" ]; then
    echo ""
    echo "✓ Icon created successfully: assets/icon.icns"
    ls -la assets/icon.icns
else
    echo "✗ ERROR: Failed to create icon.icns"
    exit 1
fi
