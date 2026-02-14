#!/usr/bin/env bash
#
# Build webOS IPK package for the Xibo Player app.
#
# Usage:
#   ./build-ipk.sh                     # Build with default CMS URL
#   ./build-ipk.sh --cms-url URL       # Bake a custom CMS URL into the build
#
# Prerequisites:
#   - @webosose/ares-cli installed globally: npm install -g @webosose/ares-cli
#   - Or ares-package available in PATH
#
# Output:
#   dist/com.tecman.xiboplayer_<version>_all.ipk
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${SCRIPT_DIR}/dist"
APP_DIR="${SCRIPT_DIR}"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
CMS_URL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cms-url)
      CMS_URL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--cms-url URL]"
      echo ""
      echo "Options:"
      echo "  --cms-url URL   Set the default CMS URL baked into the app"
      echo "  -h, --help      Show this help"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------
if ! command -v ares-package &>/dev/null; then
  echo "ERROR: ares-package not found." >&2
  echo "" >&2
  echo "Install the webOS CLI tools:" >&2
  echo "  npm install -g @webosose/ares-cli" >&2
  echo "" >&2
  echo "Or see: https://www.webosose.org/docs/tools/sdk/cli/cli-user-guide/" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Generate PNG icons from SVG (if ImageMagick or rsvg-convert is available)
# ---------------------------------------------------------------------------
generate_icons() {
  local generated=false

  if command -v rsvg-convert &>/dev/null; then
    echo "Generating PNG icons with rsvg-convert..."
    rsvg-convert -w 80  -h 80  "${APP_DIR}/icon.svg"      -o "${APP_DIR}/icon.png"
    rsvg-convert -w 130 -h 130 "${APP_DIR}/largeIcon.svg"  -o "${APP_DIR}/largeIcon.png"
    # bgImage: 1920x1080 black background
    convert -size 1920x1080 xc:black "${APP_DIR}/bgImage.png" 2>/dev/null || true
    generated=true
  elif command -v convert &>/dev/null; then
    echo "Generating PNG icons with ImageMagick..."
    convert -background none -resize 80x80   "${APP_DIR}/icon.svg"      "${APP_DIR}/icon.png"
    convert -background none -resize 130x130 "${APP_DIR}/largeIcon.svg"  "${APP_DIR}/largeIcon.png"
    convert -size 1920x1080 xc:black "${APP_DIR}/bgImage.png"
    generated=true
  fi

  if [ "$generated" = false ]; then
    # Create minimal 1x1 PNGs as placeholders if no conversion tool is available
    # These are valid PNG files (smallest possible)
    if [ ! -f "${APP_DIR}/icon.png" ]; then
      echo "WARNING: No image conversion tool found. Creating minimal placeholder PNGs."
      echo "         Install rsvg-convert or ImageMagick for proper icons."
      # Minimal valid 80x80 black PNG (base64-decoded)
      printf '\x89PNG\r\n\x1a\n' > "${APP_DIR}/icon.png"
      printf '\x89PNG\r\n\x1a\n' > "${APP_DIR}/largeIcon.png"
      printf '\x89PNG\r\n\x1a\n' > "${APP_DIR}/bgImage.png"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Optionally inject CMS URL into app.js
# ---------------------------------------------------------------------------
if [ -n "$CMS_URL" ]; then
  echo "Setting CMS URL to: ${CMS_URL}"
  # Use sed to replace the DEFAULT_CMS_URL in app.js
  sed -i "s|var DEFAULT_CMS_URL = '.*';|var DEFAULT_CMS_URL = '${CMS_URL}';|" "${APP_DIR}/js/app.js"
fi

# ---------------------------------------------------------------------------
# Generate icons if they don't exist
# ---------------------------------------------------------------------------
if [ ! -f "${APP_DIR}/icon.png" ] || [ ! -f "${APP_DIR}/largeIcon.png" ]; then
  generate_icons
fi

# ---------------------------------------------------------------------------
# Read version from appinfo.json
# ---------------------------------------------------------------------------
VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "${APP_DIR}/appinfo.json" | grep -o '[0-9][^"]*')
APP_ID=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "${APP_DIR}/appinfo.json" | grep -o '"[^"]*"$' | tr -d '"')

echo ""
echo "Building webOS IPK package"
echo "  App ID:  ${APP_ID}"
echo "  Version: ${VERSION}"
echo ""

# ---------------------------------------------------------------------------
# Create dist directory
# ---------------------------------------------------------------------------
mkdir -p "${DIST_DIR}"

# ---------------------------------------------------------------------------
# Package the app
# ---------------------------------------------------------------------------
echo "Packaging..."

# ares-package excludes common dev files automatically.
# Explicitly exclude files that should not ship in the IPK.
ares-package \
  --outdir "${DIST_DIR}" \
  --exclude "dist,*.sh,*.svg,*.md,.git,.github,node_modules,.DS_Store" \
  "${APP_DIR}"

echo ""
echo "Build complete!"
echo ""

# Find the generated IPK
IPK_FILE=$(ls -t "${DIST_DIR}"/*.ipk 2>/dev/null | head -1)
if [ -n "$IPK_FILE" ]; then
  echo "Output: ${IPK_FILE}"
  echo "Size:   $(du -h "$IPK_FILE" | cut -f1)"
  echo ""
  echo "To install on a webOS device:"
  echo "  ares-install --device <DEVICE> ${IPK_FILE}"
  echo ""
  echo "To launch:"
  echo "  ares-launch --device <DEVICE> ${APP_ID}"
else
  echo "ERROR: IPK file not found in ${DIST_DIR}" >&2
  exit 1
fi
