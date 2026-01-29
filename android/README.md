# Android Player

Android wrapper for the Xibo PWA player core.

## Architecture

```
MainActivity (Kotlin)
    ↓
WebView (loads core/ PWA)
    ↓
JavaScript player logic (shared with PWA)
```

## Implementation

The Android app is a thin native shell around the PWA:

1. **WebView Activity** — Full-screen WebView loading `file:///android_asset/index.html`
2. **Boot Receiver** — Auto-start on device boot
3. **Kiosk Mode** — Prevent user from exiting, hide navigation
4. **Screen Lock** — Keep screen always on
5. **Asset Bundler** — Copy `../core/` files into `app/src/main/assets/`

## Key Files

```
app/src/main/
├── kotlin/
│   └── com/tecman/xibo/
│       ├── MainActivity.kt          — WebView activity
│       ├── BootReceiver.kt          — Auto-start on boot
│       └── KioskHelper.kt           — Lock to kiosk mode
├── assets/
│   └── (copied from ../core/)       — PWA files
└── AndroidManifest.xml              — Permissions, receivers
```

## Permissions

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

## Build

```bash
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`

## TODO

- [ ] Create Android Studio project
- [ ] Implement WebView activity
- [ ] Implement boot receiver
- [ ] Add asset copy task to Gradle
- [ ] Test on Android TV
