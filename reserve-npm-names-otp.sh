#!/bin/bash
# reserve-npm-names-otp.sh
# Reserves all @xiboplayer/* package names on npm (with 2FA/OTP support)
# Publishes packages with OTP from authenticator app

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

# Prompt for OTP
echo -e "${YELLOW}🔐 2FA is enabled on your account${NC}"
echo -e "${YELLOW}Enter OTP from your authenticator app:${NC}"
read -r OTP

if [ -z "$OTP" ]; then
  echo -e "${RED}❌ OTP is required${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Got OTP, proceeding with fast batch publish...${NC}"
echo ""

# Create temporary directory
TEMP_DIR="/tmp/xibo-npm-placeholders-$$"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Function to create and publish placeholder
publish_placeholder() {
  local pkg_name=$1
  local otp=$2
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
    "url": "git+https://github.com/xibo/xibo-players.git"
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

  # Publish with OTP
  cd "$pkg_dir"
  local publish_output
  if publish_output=$(npm publish --access public --otp="$otp" 2>&1); then
    echo -e "   ${GREEN}✅ Published @xiboplayer/$pkg_name@0.0.0${NC}"
    return 0
  else
    if echo "$publish_output" | grep -q "EOTP"; then
      echo -e "   ${RED}❌ OTP expired or invalid${NC}"
      echo "$publish_output" | grep -i "error" | head -3
      return 1
    elif echo "$publish_output" | grep -q "You cannot publish over the previously published versions"; then
      echo -e "   ${YELLOW}⚠️  Already published (skipping)${NC}"
      return 0
    elif echo "$publish_output" | grep -q "402"; then
      echo -e "   ${YELLOW}⚠️  402 Payment Required - npm may require billing for scoped packages${NC}"
      echo -e "   ${YELLOW}Visit: https://www.npmjs.com/settings/xiboplayer/billing${NC}"
      return 1
    else
      echo -e "   ${RED}❌ Failed to publish @xiboplayer/$pkg_name${NC}"
      echo "$publish_output" | head -10
      return 1
    fi
  fi

  cd - > /dev/null
}

# Publish all placeholders (fast, to use OTP before expiry)
echo -e "${BLUE}Starting fast batch publish...${NC}"
echo ""

failed_packages=()
success_count=0

for pkg in "${PACKAGES[@]}"; do
  if publish_placeholder "$pkg" "$OTP"; then
    ((success_count++)) || true
  else
    failed_packages+=("$pkg")
    # If OTP expired, ask for new one
    if [ ${#failed_packages[@]} -eq 1 ]; then
      echo ""
      echo -e "${YELLOW}🔐 OTP may have expired. Enter a new OTP to continue:${NC}"
      read -r NEW_OTP
      if [ -n "$NEW_OTP" ]; then
        OTP="$NEW_OTP"
        # Retry this package
        failed_packages=()
        if publish_placeholder "$pkg" "$OTP"; then
          ((success_count++)) || true
        else
          failed_packages+=("$pkg")
        fi
      fi
    fi
  fi
done

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ${#failed_packages[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ Package name reservation complete! ($success_count/${#PACKAGES[@]} packages)${NC}"
else
  echo -e "${YELLOW}⚠️  $success_count/${#PACKAGES[@]} packages published${NC}"
  echo -e "${YELLOW}Failed: ${failed_packages[*]}${NC}"
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

if [ ${#failed_packages[@]} -gt 0 ]; then
  echo -e "${YELLOW}To retry failed packages, run this script again${NC}"
  echo ""
fi

# Cleanup
rm -rf "$TEMP_DIR"
