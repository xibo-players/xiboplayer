#!/bin/bash
# reserve-npm-names.sh
# Reserves all @xiboplayer/* package names on npm to prevent name squatting
# Run this BEFORE starting the implementation to secure all package names

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check npm login
if ! npm whoami &>/dev/null; then
  echo -e "${RED}❌ Not logged in to npm${NC}"
  echo "Run: npm login"
  echo "Then run this script again"
  exit 1
fi

echo -e "${GREEN}✅ Logged in as: $(npm whoami)${NC}"
echo ""

# Verify we own the @xiboplayer org
if ! npm org ls xiboplayer 2>/dev/null | grep -q "$(npm whoami)"; then
  echo -e "${RED}❌ You don't have access to @xiboplayer org${NC}"
  echo "Expected user: linuxnow"
  echo "Actual user: $(npm whoami)"
  exit 1
fi

echo -e "${GREEN}✅ Verified access to @xiboplayer org${NC}"
echo ""

# Create temporary directory
TEMP_DIR="/tmp/xibo-npm-placeholders-$$"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Package names to reserve under @xiboplayer org
PACKAGES=(
  "core"
  "renderer"
  "schedule"
  "xmds"
  "cache"
  "utils"
  "sw"
  "xmr"
  "player"
)

echo -e "${BLUE}📦 Will reserve ${#PACKAGES[@]} package names:${NC}"
for pkg in "${PACKAGES[@]}"; do
  echo "   - @xiboplayer/$pkg"
done
echo ""

# Function to create and publish placeholder
publish_placeholder() {
  local pkg_name=$1
  local pkg_dir="$TEMP_DIR/$pkg_name"

  echo -e "${BLUE}📦 Reserving @xiboplayer/$pkg_name...${NC}"

  mkdir -p "$pkg_dir"

  # Create minimal package.json
  cat > "$pkg_dir/package.json" << EOF
{
  "name": "@xiboplayer/$pkg_name",
  "version": "0.0.0",
  "description": "Xibo Player - Coming Soon (placeholder to reserve name)",
  "keywords": ["xibo", "digital-signage", "player"],
  "author": "Pau Aliagas <linuxnow@gmail.com>",
  "license": "AGPL-3.0-or-later",
  "repository": {
    "type": "git",
    "url": "https://github.com/xibo/xibo-players.git"
  },
  "private": false
}
EOF

  # Create minimal README
  cat > "$pkg_dir/README.md" << EOF
# @xiboplayer/$pkg_name

**Status:** 🚧 Coming Soon

This package is currently under development as part of the Xibo Players project.

## Installation

This is a placeholder package. The actual implementation will be published soon.

\`\`\`bash
# Once published:
npm install @xiboplayer/$pkg_name
\`\`\`

## Repository

https://github.com/xibo/xibo-players

## License

AGPL-3.0-or-later
EOF

  # Create minimal index.js (prevents "no entry point" warnings)
  cat > "$pkg_dir/index.js" << 'EOF'
// Placeholder - implementation coming soon
export default {};
EOF

  # Publish (with retry on 402 payment required error)
  cd "$pkg_dir"
  local publish_output
  if publish_output=$(npm publish --access public 2>&1); then
    echo -e "   ${GREEN}✅ Published @xiboplayer/$pkg_name@0.0.0${NC}"
    return 0
  else
    if echo "$publish_output" | grep -q "402"; then
      echo -e "   ${YELLOW}⚠️  402 Payment Required - npm may require billing for scoped packages${NC}"
      echo -e "   ${YELLOW}Visit: https://www.npmjs.com/settings/xiboplayer/billing${NC}"
      return 1
    elif echo "$publish_output" | grep -q "You cannot publish over the previously published versions"; then
      echo -e "   ${YELLOW}⚠️  Already published (skipping)${NC}"
      return 0
    else
      echo -e "   ${RED}❌ Failed to publish @xiboplayer/$pkg_name${NC}"
      echo "$publish_output"
      return 1
    fi
  fi

  cd - > /dev/null
}

# Publish all placeholders
echo -e "${BLUE}Starting package name reservation...${NC}"
echo ""

failed_packages=()
for pkg in "${PACKAGES[@]}"; do
  if ! publish_placeholder "$pkg"; then
    failed_packages+=("$pkg")
  fi
  sleep 1  # Rate limiting
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ${#failed_packages[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ Package name reservation complete!${NC}"
else
  echo -e "${YELLOW}⚠️  Some packages failed: ${failed_packages[*]}${NC}"
fi

echo ""
echo -e "${BLUE}Reserved packages:${NC}"
for pkg in "${PACKAGES[@]}"; do
  if npm view @xiboplayer/$pkg version &>/dev/null; then
    version=$(npm view @xiboplayer/$pkg version)
    echo -e "  ${GREEN}✅${NC} @xiboplayer/$pkg: v$version"
  else
    echo -e "  ${RED}❌${NC} @xiboplayer/$pkg: not published"
  fi
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Verify packages at: https://www.npmjs.com/org/xiboplayer"
echo "2. When ready to publish real packages, bump to v1.0.0"
echo "3. Start Phase 1: Create package structure"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"
