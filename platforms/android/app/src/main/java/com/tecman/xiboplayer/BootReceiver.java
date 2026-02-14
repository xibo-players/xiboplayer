package com.tecman.xiboplayer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * BroadcastReceiver that starts the Xibo Player on device boot.
 * Essential for digital signage deployments where the player must
 * auto-start after power outages or scheduled reboots.
 *
 * Listens for:
 * - android.intent.action.BOOT_COMPLETED (standard boot)
 * - android.intent.action.QUICKBOOT_POWERON (some OEMs)
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "XiboPlayer";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            Log.i(TAG, "Boot completed, starting Xibo Player");

            Intent launchIntent = new Intent(context, LauncherActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

            try {
                context.startActivity(launchIntent);
                Log.i(TAG, "Xibo Player started successfully after boot");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start Xibo Player after boot", e);
            }
        }
    }
}
