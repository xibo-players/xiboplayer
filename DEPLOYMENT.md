# Deployment Guide

Complete guide for deploying the Xibo Player to production servers and devices.

## Table of Contents

- [PWA Deployment](#pwa-deployment)
- [Electron Deployment](#electron-deployment)
- [Chrome Extension Deployment](#chrome-extension-deployment)
- [Android Deployment](#android-deployment)
- [webOS Deployment](#webos-deployment)
- [Ansible Automation](#ansible-automation)

## PWA Deployment

Deploy the core PWA to a web server for browser-based access.

### Prerequisites

- Web server with HTTPS (required for PWA/Service Workers)
- SSH access to server
- Node.js for building

### Build for Production

```bash
# Clean build
cd packages/core
rm -rf dist node_modules
npm install
npm run build

# Verify output
ls -lh dist/
# Should contain: index.html, setup.html, assets/, pdf.worker.min.mjs, sw.js
```

### Manual Deployment

**Via SCP:**
```bash
# Copy to server
scp -r packages/core/dist/* user@server:/var/www/player/

# Set permissions
ssh user@server "chown -R www-data:www-data /var/www/player"
```

**Via rsync:**
```bash
rsync -avz --delete packages/core/dist/ user@server:/var/www/player/
```

### Ansible Deployment

**To displays.superpantalles.com:**

```bash
cd ~/Devel/tecman/tecman_ansible

# Deploy to production
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit h1.superpantalles.com

# Deploy to staging
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit staging.local
```

**Playbook details:**
- Source: `~/Devel/tecman/xibo_players/packages/core/dist`
- Destination: Podman volume `xibo-player-storage`
- Synchronizes all files
- Sets correct permissions

### Web Server Configuration

**Nginx configuration:**

```nginx
server {
    listen 443 ssl http2;
    server_name displays.superpantalles.com;

    root /var/www/player;
    index index.html;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Cache PDF.js worker
    location /pdf.worker.min.mjs {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache HTML files
    location ~* \\.html$ {
        add_header Cache-Control "no-cache, must-revalidate";
    }

    # Service Worker
    location /sw.js {
        add_header Cache-Control "no-cache";
        add_header Service-Worker-Allowed "/";
    }

    # CORS headers (if needed for cross-origin CMS)
    add_header Access-Control-Allow-Origin "*";
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
}
```

**Apache configuration:**

```apache
<VirtualHost *:443>
    ServerName displays.superpantalles.com
    DocumentRoot /var/www/player

    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    # Enable compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/css application/javascript
    </IfModule>

    # Cache static assets
    <Directory "/var/www/player/assets">
        ExpiresActive On
        ExpiresDefault "access plus 1 year"
        Header set Cache-Control "public, immutable"
    </Directory>

    # Service Worker
    <Files "sw.js">
        Header set Cache-Control "no-cache"
        Header set Service-Worker-Allowed "/"
    </Files>

    # Security headers
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-Content-Type-Options "nosniff"
</VirtualHost>
```

### Verify Deployment

```bash
# Test HTTP response
curl -I https://displays.superpantalles.com/player/

# Should return:
# HTTP/2 200
# content-type: text/html

# Test setup page
curl -I https://displays.superpantalles.com/player/setup.html

# Test service worker
curl -I https://displays.superpantalles.com/player/sw.js

# Test PDF worker
curl -I https://displays.superpantalles.com/player/pdf.worker.min.mjs
```

### Environment-Specific Configurations

**Production (`h1.superpantalles.com`):**
- Full XMR support
- HTTPS required
- Caching enabled
- Service Worker active

**Staging (`staging.local`):**
- Same configuration as production
- Different CMS backend
- Useful for testing before production rollout

## Electron Deployment

Deploy desktop player to Windows, Linux, and macOS devices.

### Linux (Debian/Ubuntu)

**Install .deb package:**
```bash
# Download from GitHub Releases or build locally
wget https://github.com/user/repo/releases/download/v1.0.0/xibo-player_1.0.0_amd64.deb

# Install
sudo dpkg -i xibo-player_1.0.0_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f

# Launch
xibo-player
```

**Install Snap package:**
```bash
# Install from file
sudo snap install xibo-player_1.0.0_amd64.snap --dangerous

# Or from Snap Store (if published)
sudo snap install xibo-player

# Launch
xibo-player
```

**Snap permissions:**
```bash
# Allow network access
sudo snap connect xibo-player:network

# Allow display access
sudo snap connect xibo-player:x11
```

### Windows

**Install .exe:**
1. Download `xibo-player-Setup-1.0.0.exe`
2. Double-click to run installer
3. Follow installation wizard
4. Player launches automatically

**Silent installation:**
```powershell
xibo-player-Setup-1.0.0.exe /S
```

**Launch:**
- Start menu: "Xibo Player"
- Or: `C:\Program Files\xibo-player\xibo-player.exe`

### macOS

**Install .dmg:**
1. Download `xibo-player-1.0.0.dmg`
2. Open DMG file
3. Drag "Xibo Player" to Applications folder
4. Launch from Applications

**Command line:**
```bash
# Mount DMG
hdiutil attach xibo-player-1.0.0.dmg

# Copy to Applications
cp -R "/Volumes/Xibo Player/Xibo Player.app" /Applications/

# Unmount
hdiutil detach "/Volumes/Xibo Player"

# Launch
open "/Applications/Xibo Player.app"
```

### Auto-Start Configuration

**Linux (systemd):**
```bash
# Create systemd service
sudo tee /etc/systemd/system/xibo-player.service <<EOF
[Unit]
Description=Xibo Digital Signage Player
After=network.target

[Service]
Type=simple
User=signage
Environment=DISPLAY=:0
ExecStart=/usr/bin/xibo-player
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable xibo-player
sudo systemctl start xibo-player
```

**Windows (Task Scheduler):**
```powershell
# Create scheduled task
$action = New-ScheduledTaskAction -Execute "C:\Program Files\xibo-player\xibo-player.exe"
$trigger = New-ScheduledTaskTrigger -AtLogon
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask -TaskName "XiboPlayer" -Action $action -Trigger $trigger -Principal $principal
```

**macOS (LaunchAgent):**
```bash
# Create launch agent
tee ~/Library/LaunchAgents/com.tecman.xibo.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tecman.xibo</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Applications/Xibo Player.app/Contents/MacOS/Xibo Player</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF

# Load
launchctl load ~/Library/LaunchAgents/com.tecman.xibo.plist
```

## Chrome Extension Deployment

Deploy to Chrome Web Store or load unpacked for testing.

### Load Unpacked (Testing)

1. Build extension: `npm run build:chrome`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select `platforms/chrome/dist/`

### Chrome Web Store

**Prerequisites:**
- Google Developer account ($5 one-time fee)
- Chrome Web Store Developer Dashboard access

**Steps:**

1. **Package extension:**
```bash
cd platforms/chrome
npm run package
# Creates xibo-player-chrome.zip
```

2. **Upload to Chrome Web Store:**
   - Visit: https://chrome.google.com/webstore/devconsole
   - Click "New Item"
   - Upload `xibo-player-chrome.zip`
   - Fill in store listing details
   - Submit for review

3. **Store listing details:**
   - **Name**: Xibo Digital Signage Player
   - **Description**: Free Xibo-compatible digital signage player
   - **Category**: Productivity
   - **Language**: English
   - **Screenshots**: 1280x800 or 640x400 required

**Review process:**
- Typically 1-7 days
- May require additional permissions justification

### Enterprise Deployment

**Force-install via policy:**

```json
{
  "ExtensionInstallForcelist": [
    "extension_id;https://clients2.google.com/service/update2/crx"
  ]
}
```

**Group Policy (Windows):**
1. Open `gpedit.msc`
2. Navigate to: Computer Configuration → Administrative Templates → Google Chrome → Extensions
3. Enable "Configure the list of force-installed apps and extensions"
4. Add extension ID

## Android Deployment

Deploy to Android devices via Google Play Store, APK distribution, or MDM.

### Google Play Store

**Prerequisites:**
- Google Play Console account ($25 one-time fee)
- Signed APK
- Store listing assets

**Steps:**

1. **Sign APK:**
```bash
# Generate keystore (first time)
keytool -genkey -v -keystore xibo-release-key.jks \
  -alias xibo -keyalg RSA -keysize 2048 -validity 10000

# Build and sign
cd platforms/android
./gradlew assembleRelease

# Sign APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore xibo-release-key.jks \
  app/build/outputs/apk/release/app-release-unsigned.apk xibo

# Align
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk \
  xibo-player.apk
```

2. **Upload to Play Console:**
   - Visit: https://play.google.com/console
   - Create app
   - Upload APK to "Production" track
   - Fill in store listing
   - Submit for review

3. **Store listing requirements:**
   - High-res icon: 512x512
   - Feature graphic: 1024x500
   - Screenshots: At least 2
   - Privacy policy URL
   - Content rating

### APK Distribution

**Direct download:**
```bash
# Host APK on web server
scp xibo-player.apk user@server:/var/www/downloads/

# Users download and install:
# 1. Enable "Unknown sources" in Android settings
# 2. Download APK
# 3. Tap to install
```

**QR code:**
- Generate QR code linking to APK download
- Users scan with camera app
- Automatically prompts to download/install

### MDM Deployment

**For enterprise device management:**

**Intune:**
1. Add as "Line-of-business app"
2. Upload APK
3. Assign to device groups

**VMware Workspace ONE:**
1. Upload to "Apps & Books"
2. Configure as "Internal" app
3. Push to devices

**Google Endpoint Management:**
1. Upload to "Mobile apps"
2. Approve for work profile
3. Deploy to managed devices

### Kiosk Mode

**Enable kiosk mode on Android:**

```bash
# Via ADB (for testing)
adb shell dpm set-device-owner com.tecman.xibo/.KioskAdmin

# Or configure via MDM policy
```

**Single-app mode:**
- Device fully locked to Xibo Player
- No access to home screen or other apps
- Requires device owner privileges

## webOS Deployment

Deploy to LG webOS smart TVs.

### Direct Installation

**Prerequisites:**
- Developer mode enabled on TV
- webOS SDK CLI tools installed

**Enable developer mode on TV:**
1. Launch "Developer Mode" app on TV
2. Toggle "Developer Mode" ON
3. Note IP address and passphrase

**Install IPK:**
```bash
# Add TV device
ares-setup-device

# Install app
ares-install --device tv com.tecman.xibo_1.0.0_all.ipk

# Launch
ares-launch --device tv com.tecman.xibo
```

### LG Content Store

**For public distribution:**

1. **Seller account:**
   - Register at: http://seller.lgappstv.com
   - Complete seller verification

2. **Submit app:**
   - Upload IPK
   - Provide app details
   - Submit for certification

3. **Certification process:**
   - LG reviews app (7-14 days)
   - May require changes
   - Upon approval, published to store

### Enterprise Deployment

**Pro:Centric (LG's hospitality platform):**
- Deploy to hotel/hospitality TVs
- Centralized management
- Automatic app installation

**Pro:Idiom (healthcare):**
- Deploy to healthcare TVs
- HIPAA-compliant management

## Ansible Automation

Automated deployment using Ansible playbooks.

### Deploy PWA to Production

```bash
cd ~/Devel/tecman/tecman_ansible

# Deploy to production server
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit h1.superpantalles.com

# Deploy to staging
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit staging.local

# Deploy to multiple hosts
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit "production,staging"
```

### Playbook Structure

**Location:** `playbooks/services/deploy-player.yml`

**What it does:**
1. Gets Xibo player volume mountpoint
2. Synchronizes PWA files from local build to volume
3. Sets correct ownership and permissions

**Variables:**
```yaml
player_source: ~/Devel/tecman/xibo_players/packages/core/dist
xibo_volume: xibo-player-storage
```

### Inventory Configuration

**Production host:**
```yaml
production:
  hosts:
    h1.superpantalles.com:
      ansible_user: pau
      ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

**Service variables:**
```yaml
arexibo_cms_host: "https://displays.superpantalles.com/"
arexibo_cms_key: "isiSdUCy"
```

### Deployment Workflow

**Full deployment process:**

```bash
# 1. Build core PWA
cd ~/Devel/tecman/xibo_players
npm run build:core

# 2. Run tests
npm test

# 3. Deploy to staging (test environment)
cd ~/Devel/tecman/tecman_ansible
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit staging.local

# 4. Test on staging
curl -I https://staging.local/player/

# 5. Deploy to production
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit h1.superpantalles.com

# 6. Verify production
curl -I https://displays.superpantalles.com/player/
```

## Post-Deployment

### Verification

**All platforms:**
1. Verify files deployed correctly
2. Test initial load/setup page
3. Configure with test display
4. Verify XMDS connection
5. Check license bypass (`clientType: linux`)
6. Test XMR real-time commands (if available)
7. Monitor logs for errors

### Monitoring

**PWA (web server):**
```bash
# Nginx access logs
tail -f /var/log/nginx/access.log | grep player

# Error logs
tail -f /var/log/nginx/error.log
```

**Electron (systemd):**
```bash
# View service logs
journalctl -u xibo-player -f

# Check service status
systemctl status xibo-player
```

**Android (logcat):**
```bash
# View app logs
adb logcat | grep Xibo

# Or on device with app
adb shell
logcat | grep Xibo
```

**webOS:**
```bash
# View app logs
ares-inspect --device tv --app com.tecman.xibo
```

### Rollback

**If deployment fails:**

**PWA:**
```bash
# Restore from backup
rsync -avz /var/backups/player-YYYYMMDD/ /var/www/player/

# Or use Ansible with previous version
ansible-playbook -i inventory.yml \
  playbooks/services/deploy-player.yml \
  --limit h1.superpantalles.com \
  -e "player_source=/path/to/previous/version"
```

**Electron:**
- Uninstall current version
- Reinstall previous version

**Android/webOS:**
- Uninstall app
- Install previous APK/IPK

## Troubleshooting

### Deployment Fails

**Ansible playbook fails:**
```bash
# Check connectivity
ansible -i inventory.yml h1.superpantalles.com -m ping

# Check volume exists
ssh h1.superpantalles.com "podman volume inspect xibo-player-storage"

# Manual sync for debugging
rsync -avz packages/core/dist/ \
  user@server:/path/to/volume/
```

### Service Won't Start

**Electron systemd service:**
```bash
# Check service status
systemctl status xibo-player

# View recent logs
journalctl -u xibo-player -n 50

# Check DISPLAY variable
echo $DISPLAY
```

### Permission Issues

**Fix web server permissions:**
```bash
# Set ownership
sudo chown -R www-data:www-data /var/www/player

# Set permissions
sudo chmod -R 755 /var/www/player
```

## Next Steps

- [Testing Guide](TESTING.md) - How to test deployments
- [Architecture](ARCHITECTURE.md) - Technical details
- [Build Guide](BUILD.md) - How to build for deployment
