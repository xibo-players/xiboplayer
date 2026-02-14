#!/usr/bin/env bash
#
# Build script for Xibo PWA Android TWA Player
#
# Usage:
#   ./build-apk.sh                    Build debug APK with default URL
#   ./build-apk.sh release            Build release APK
#   ./build-apk.sh debug "https://..."  Build debug APK with custom URL
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_TYPE="${1:-debug}"
PWA_URL="${2:-}"

echo "=== Xibo PWA Android TWA Player Build ==="
echo "Build type: $BUILD_TYPE"

# Ensure gradlew is executable
if [ -f gradlew ]; then
    chmod +x gradlew
else
    echo "ERROR: gradlew not found. Run this script from the android/ project root."
    echo "If you have not initialized the Gradle wrapper, run:"
    echo "  gradle wrapper --gradle-version 8.4"
    exit 1
fi

# Build the APK
GRADLE_ARGS=""
if [ -n "$PWA_URL" ]; then
    echo "PWA URL: $PWA_URL"
    GRADLE_ARGS="-PpwaUrl=$PWA_URL"
fi

if [ "$BUILD_TYPE" = "release" ]; then
    echo "Building release APK..."
    ./gradlew assembleRelease $GRADLE_ARGS
    APK_PATH="app/build/outputs/apk/release/app-release.apk"

    if [ ! -f "$APK_PATH" ]; then
        APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
    fi
else
    echo "Building debug APK..."
    ./gradlew assembleDebug $GRADLE_ARGS
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

echo ""
if [ -f "$APK_PATH" ]; then
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    echo "Build successful!"
    echo "APK: $APK_PATH ($APK_SIZE)"
    echo ""
    echo "Install on connected device:"
    echo "  adb install -r $APK_PATH"
else
    echo "ERROR: APK not found at expected path: $APK_PATH"
    echo "Check the Gradle output above for errors."
    exit 1
fi
