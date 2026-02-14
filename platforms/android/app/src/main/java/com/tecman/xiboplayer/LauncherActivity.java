package com.tecman.xiboplayer;

import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.TrustedWebUtils;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * LauncherActivity for the Xibo PWA Digital Signage player.
 *
 * This activity launches the PWA in one of two modes:
 * 1. TWA mode (preferred): Uses Chrome Custom Tabs with Trusted Web Activity.
 *    Requires Chrome 72+ and Digital Asset Links verification on the server.
 *    Provides full PWA capabilities: service workers, caching, push notifications.
 *
 * 2. WebView fallback: If no TWA-capable browser is available, falls back to
 *    an embedded WebView. Limited PWA support but works on all devices.
 *
 * Features:
 * - Kiosk mode support via DevicePolicyManager (lock task)
 * - Screen always on (FLAG_KEEP_SCREEN_ON)
 * - Immersive fullscreen (hides status bar and navigation)
 * - Configurable PWA URL via intent extras or SharedPreferences
 * - Auto-start on boot (via BootReceiver)
 */
public class LauncherActivity extends AppCompatActivity {

    private static final String TAG = "XiboPlayer";
    private static final String PREFS_NAME = "xibo_player_prefs";
    private static final String PREF_PWA_URL = "pwa_url";
    private static final String EXTRA_PWA_URL = "pwa_url";

    /** Minimum Chrome version that supports TWA */
    private static final int MIN_CHROME_VERSION_FOR_TWA = 72;

    private WebView webView;
    private boolean isUsingWebView = false;
    private String pwaUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the screen on -- essential for digital signage
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Enter immersive fullscreen mode
        enterImmersiveMode();

        // Resolve the PWA URL from intent extras, SharedPreferences, or default
        pwaUrl = resolvePwaUrl();
        Log.i(TAG, "PWA URL: " + pwaUrl);

        // Try to enable kiosk mode (lock task) if permitted
        tryEnableKioskMode();

        // Launch TWA or fall back to WebView
        if (isTwaSupported()) {
            Log.i(TAG, "Launching in TWA mode");
            launchTwa(pwaUrl);
        } else {
            Log.i(TAG, "TWA not supported, falling back to WebView");
            launchWebView(pwaUrl);
        }
    }

    /**
     * Resolves the PWA URL to use, with the following priority:
     * 1. Intent extra "pwa_url" (for ADB or programmatic launch)
     * 2. SharedPreferences (persisted from previous override)
     * 3. Build-time gradle property override (pwa_url_override resource)
     * 4. Default from strings.xml
     */
    private String resolvePwaUrl() {
        // 1. Check intent extras
        Intent intent = getIntent();
        if (intent != null && intent.hasExtra(EXTRA_PWA_URL)) {
            String intentUrl = intent.getStringExtra(EXTRA_PWA_URL);
            if (intentUrl != null && !intentUrl.isEmpty()) {
                // Persist for future launches
                saveUrlToPrefs(intentUrl);
                Log.i(TAG, "Using PWA URL from intent extra");
                return intentUrl;
            }
        }

        // 2. Check SharedPreferences
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedUrl = prefs.getString(PREF_PWA_URL, null);
        if (savedUrl != null && !savedUrl.isEmpty()) {
            Log.i(TAG, "Using PWA URL from SharedPreferences");
            return savedUrl;
        }

        // 3. Check build-time gradle override
        try {
            String overrideUrl = getString(
                getResources().getIdentifier("pwa_url_override", "string", getPackageName())
            );
            if (overrideUrl != null && !overrideUrl.isEmpty()
                    && !overrideUrl.equals("https://h1.superpantalles.com:8081/player/pwa/")) {
                // Only use if it was actually overridden from default
                Log.i(TAG, "Using PWA URL from gradle property override");
                return overrideUrl;
            }
        } catch (Exception e) {
            // Resource not found, continue to default
        }

        // 4. Default from strings.xml
        Log.i(TAG, "Using default PWA URL from strings.xml");
        return getString(R.string.default_pwa_url);
    }

    /**
     * Persists the PWA URL to SharedPreferences for future launches.
     */
    private void saveUrlToPrefs(String url) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PREF_PWA_URL, url).apply();
    }

    /**
     * Checks if the device has a browser that supports Trusted Web Activities.
     * TWA requires Chrome 72+ or another browser that declares CustomTabsService.
     */
    private boolean isTwaSupported() {
        // Get packages that support Custom Tabs
        List<String> customTabsPackages = getCustomTabsPackages();
        if (customTabsPackages.isEmpty()) {
            Log.w(TAG, "No Custom Tabs packages found");
            return false;
        }

        // Check if any of them support TWA (Chrome 72+)
        for (String packageName : customTabsPackages) {
            if (isTwaCapable(packageName)) {
                Log.i(TAG, "TWA-capable browser found: " + packageName);
                return true;
            }
        }

        Log.w(TAG, "No TWA-capable browser found among: " + customTabsPackages);
        return false;
    }

    /**
     * Returns a list of packages that support Custom Tabs.
     */
    private List<String> getCustomTabsPackages() {
        PackageManager pm = getPackageManager();
        Intent serviceIntent = new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION);
        List<ResolveInfo> resolveInfos = pm.queryIntentServices(serviceIntent, 0);
        List<String> packages = new ArrayList<>();

        if (resolveInfos != null) {
            for (ResolveInfo info : resolveInfos) {
                if (info.serviceInfo != null && info.serviceInfo.packageName != null) {
                    packages.add(info.serviceInfo.packageName);
                }
            }
        }

        return packages;
    }

    /**
     * Checks if a specific browser package supports TWA.
     * Chrome 72+ supports TWA. We check by version name.
     */
    private boolean isTwaCapable(String packageName) {
        try {
            String versionName = getPackageManager()
                    .getPackageInfo(packageName, 0)
                    .versionName;

            if (versionName == null) {
                return false;
            }

            // Chrome version name format: "72.0.3626.105"
            // Extract major version number
            String[] parts = versionName.split("\\.");
            if (parts.length > 0) {
                try {
                    int majorVersion = Integer.parseInt(parts[0]);
                    return majorVersion >= MIN_CHROME_VERSION_FOR_TWA;
                } catch (NumberFormatException e) {
                    // Not a standard version number, assume capable
                    return true;
                }
            }
        } catch (PackageManager.NameNotFoundException e) {
            Log.w(TAG, "Package not found: " + packageName);
        }
        return false;
    }

    /**
     * Launches the PWA in Trusted Web Activity mode.
     * This opens Chrome (or compatible browser) in a fullscreen mode
     * with no browser UI, providing a native app experience.
     */
    private void launchTwa(String url) {
        try {
            Uri uri = Uri.parse(url);

            // Build the Custom Tabs intent with TWA parameters
            CustomTabColorSchemeParams colorParams = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(ContextCompat.getColor(this, R.color.twaToolbarColor))
                    .setNavigationBarColor(ContextCompat.getColor(this, R.color.navigationBarColor))
                    .build();

            CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(colorParams)
                    .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
                    .setUrlBarHidingEnabled(true)
                    .build();

            // Set the intent to open as a Trusted Web Activity
            // This uses TrustedWebUtils from the androidx.browser library
            TrustedWebUtils.launchAsTrustedWebActivity(this, customTabsIntent, uri);

            // After launching TWA, this activity is no longer visible.
            // We don't finish() here so we can handle re-entry and kiosk mode.
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch TWA, falling back to WebView", e);
            launchWebView(url);
        }
    }

    /**
     * Falls back to an embedded WebView when TWA is not available.
     * Configures the WebView for maximum PWA compatibility.
     */
    private void launchWebView(String url) {
        isUsingWebView = true;

        // Create a fullscreen FrameLayout container
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.BLACK);
        container.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        // Create and configure WebView
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        // Configure WebView settings for PWA compatibility
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        // User agent: append XiboPlayer identifier
        String defaultUserAgent = settings.getUserAgentString();
        settings.setUserAgentString(defaultUserAgent + " XiboPlayer/1.0");

        // WebViewClient: keep navigation within the WebView
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // Keep all navigation within the WebView
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    return false; // Let WebView handle it
                }
                return true; // Block non-HTTP schemes
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + errorCode + " " + description + " for " + failingUrl);
            }
        });

        // WebChromeClient: handle JS dialogs, fullscreen video, etc.
        webView.setWebChromeClient(new WebChromeClient() {
            private View fullscreenView;

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                // Handle fullscreen video
                fullscreenView = view;
                container.addView(view);
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView != null) {
                    container.removeView(fullscreenView);
                    fullscreenView = null;
                    webView.setVisibility(View.VISIBLE);
                }
            }
        });

        container.addView(webView);
        setContentView(container);

        // Load the PWA URL
        webView.loadUrl(url);
    }

    /**
     * Enters immersive fullscreen mode, hiding the status bar
     * and navigation bar. They can be revealed by swiping from the edge.
     */
    private void enterImmersiveMode() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        );

        // Re-apply immersive mode when focus changes
        decorView.setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) {
                // Bars are visible, re-hide after a short delay
                decorView.postDelayed(() -> enterImmersiveMode(), 3000);
            }
        });
    }

    /**
     * Attempts to enable kiosk mode (lock task) if the app is set as Device Owner.
     * This prevents the user from leaving the app via home/recent buttons.
     *
     * To set as device owner:
     *   adb shell dpm set-device-owner com.tecman.xiboplayer/.LauncherActivity
     */
    private void tryEnableKioskMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(this, LauncherActivity.class);

            if (dpm != null && dpm.isDeviceOwnerApp(getPackageName())) {
                // We are device owner -- enable lock task mode
                String[] packages = { getPackageName() };
                dpm.setLockTaskPackages(adminComponent, packages);

                try {
                    startLockTask();
                    Log.i(TAG, "Kiosk mode (lock task) enabled");
                } catch (Exception e) {
                    Log.e(TAG, "Failed to start lock task", e);
                }
            } else {
                // Not device owner -- try pinned mode (requires user confirmation)
                ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                if (am != null && !am.isInLockTaskMode()) {
                    Log.i(TAG, "Not device owner. Kiosk mode requires: "
                            + "adb shell dpm set-device-owner com.tecman.xiboplayer/.LauncherActivity");
                }
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // In kiosk/signage mode, disable back button
        // For WebView mode, we could optionally go back in history,
        // but for digital signage, we want to stay on the player page.
        if (isUsingWebView && webView != null && webView.canGoBack()) {
            // Only allow going back within the PWA itself
            // (e.g., from a setup page back to the player)
            webView.goBack();
        }
        // Otherwise, do nothing -- prevent exiting the app
    }
}
