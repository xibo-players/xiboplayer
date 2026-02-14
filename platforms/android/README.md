# Android TWA Player for Xibo PWA Digital Signage

A Trusted Web Activity (TWA) wrapper that runs the Xibo PWA digital signage player
as a native Android app. The PWA runs in Chrome's TWA mode (full-screen, no browser
UI), with fallback to WebView for older devices.

## Architecture

```
LauncherActivity (Java)
    |
    +-- TWA mode (Chrome 72+): TrustedWebActivityIntentBuilder
    |       Full PWA with service worker, caching, notifications
    |
    +-- Fallback (older Chrome): WebView
            Loads same URL, limited PWA features
```

## Prerequisites

- **JDK 17** or later
- **Android SDK** with compileSdk 34
- **Android Build Tools** 34.0.0
- Optional: Android Studio Hedgehog or later

## Quick Build (Debug APK)

```bash
# First time: generate Gradle wrapper (requires Gradle installed globally)
gradle wrapper --gradle-version 8.4

# Make scripts executable
chmod +x gradlew build-apk.sh

# Build debug APK
./gradlew assembleDebug

# Or use the build script
./build-apk.sh
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

## Configuration

### PWA URL

The default PWA URL is set in `app/src/main/res/values/strings.xml`:

```xml
<string name="default_pwa_url">https://h1.superpantalles.com:8081/player/pwa/</string>
```

Change this to your CMS instance URL before building.

### Runtime URL Override

The URL can be overridden at runtime:
1. Via intent extra: `adb shell am start -n com.tecman.xiboplayer/.LauncherActivity --es pwa_url "https://your-cms/player/pwa/"`
2. Via SharedPreferences (persisted after first override)

### Digital Asset Links

For TWA verification (removes "Running in Chrome" banner), you must host
`.well-known/assetlinks.json` on your server. See the template in `.well-known/assetlinks.json`
and replace the SHA-256 fingerprint with your signing key's fingerprint:

```bash
# Get debug key fingerprint
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA256
```

### Kiosk Mode

To enable kiosk mode (lock task / pinned mode), set this app as Device Owner:

```bash
adb shell dpm set-device-owner com.tecman.xiboplayer/.LauncherActivity
```

Or use Android Management API for enterprise deployment.

## Project Structure

```
android/
+-- build.gradle                       Root build file
+-- settings.gradle                    Module settings
+-- gradle.properties                  Gradle configuration
+-- gradlew / gradlew.bat             Gradle wrapper scripts
+-- build-apk.sh                       Quick build script
+-- app/
|   +-- build.gradle                   Module build file
|   +-- src/main/
|       +-- AndroidManifest.xml
|       +-- java/com/tecman/xiboplayer/
|       |   +-- LauncherActivity.java  TWA launch + fallback
|       |   +-- BootReceiver.java     Auto-start on boot
|       +-- res/
|           +-- values/
|           |   +-- strings.xml
|           |   +-- colors.xml
|           +-- drawable/
|               +-- ic_launcher_background.xml
+-- .well-known/
|   +-- assetlinks.json                Template for server-side DAL
+-- .github/workflows/
    +-- build-android.yml              CI build workflow
```

## Install on Device

```bash
# Install debug APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch
adb shell am start -n com.tecman.xiboplayer/.LauncherActivity
```

## Release Build

1. Create a keystore:
   ```bash
   keytool -genkey -v -keystore release.keystore -alias xibo-player \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Configure signing in `app/build.gradle` (signingConfigs section).

3. Build:
   ```bash
   ./gradlew assembleRelease
   ```

4. Update `assetlinks.json` on your server with the release key fingerprint.
