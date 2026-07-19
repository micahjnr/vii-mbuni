package app.netlify.vii_mbuni.twa;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Checks a small JSON manifest hosted on the Netlify site for a newer app
 * build. If one is found, downloads the new APK and prompts the user to
 * install it. Android does not allow silent self-installation outside the
 * Play Store, so the user must approve both "install unknown apps" (once)
 * and the actual install prompt (every update).
 *
 * Manifest format (https://vii-mbuni.netlify.app/update.json), published
 * automatically by .github/workflows/build-apk.yml on every push to main:
 * {
 *   "versionCode": 4,
 *   "versionName": "1.0.4",
 *   "apkUrl": "https://vii-mbuni.netlify.app/downloads/vii-mbuni-latest.apk",
 *   "notes": "What changed in this build"
 * }
 */
public class UpdateManager {

    private static final String TAG = "UpdateManager";
    private static final String UPDATE_MANIFEST_URL = "https://vii-mbuni.netlify.app/update.json";

    private final Context context;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private long downloadId = -1;
    private BroadcastReceiver downloadReceiver;

    public UpdateManager(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Silently checks for an update in the background. Safe to call on every app start. */
    public void checkForUpdate() {
        executor.execute(() -> {
            try {
                JSONObject manifest = fetchManifest();
                if (manifest == null) return;

                int latestVersionCode = manifest.getInt("versionCode");
                @SuppressWarnings("deprecation")
                int currentVersionCode = context.getPackageManager()
                        .getPackageInfo(context.getPackageName(), 0).versionCode;

                if (latestVersionCode > currentVersionCode) {
                    String versionName = manifest.optString("versionName", "");
                    String apkUrl = manifest.getString("apkUrl");
                    String notes = manifest.optString("notes", "");
                    mainHandler.post(() -> promptInstall(versionName, apkUrl, notes));
                }
            } catch (Exception e) {
                Log.w(TAG, "Update check failed: " + e.getMessage());
            }
        });
    }

    private JSONObject fetchManifest() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(UPDATE_MANIFEST_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestProperty("Cache-Control", "no-cache");
            conn.setRequestMethod("GET");

            if (conn.getResponseCode() != 200) return null;

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();

            return new JSONObject(sb.toString());
        } catch (Exception e) {
            Log.w(TAG, "Could not fetch update manifest: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void promptInstall(String versionName, String apkUrl, String notes) {
        if (!(context instanceof Activity)) return;
        Activity activity = (Activity) context;
        if (activity.isFinishing()) return;

        String message = versionName.isEmpty()
                ? "A new version is available."
                : "Version " + versionName + " is available.";
        if (!notes.isEmpty()) message += "\n\n" + notes;

        new AlertDialog.Builder(activity)
                .setTitle("Update available")
                .setMessage(message)
                .setPositiveButton("Update", (dialog, which) -> startDownload(apkUrl))
                .setNegativeButton("Later", null)
                .setCancelable(true)
                .show();
    }

    private void startDownload(String apkUrl) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(context,
                    "Please allow installs from this app, then tap Update again.",
                    Toast.LENGTH_LONG).show();
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName()));
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settingsIntent);
            return;
        }

        Toast.makeText(context, "Downloading update…", Toast.LENGTH_SHORT).show();

        DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
        request.setTitle("Vii-Mbuni update");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, "vii-mbuni-update.apk");
        request.setMimeType("application/vnd.android.package-archive");

        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (completedId == downloadId) {
                    installDownloadedApk();
                    try {
                        ctx.unregisterReceiver(this);
                    } catch (IllegalArgumentException ignored) {
                    }
                    downloadReceiver = null;
                }
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(downloadReceiver,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    Context.RECEIVER_NOT_EXPORTED);
        } else {
            context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }

        downloadId = downloadManager.enqueue(request);
    }

    private void installDownloadedApk() {
        File apkFile = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "vii-mbuni-update.apk");
        if (!apkFile.exists()) {
            Log.w(TAG, "Downloaded APK not found");
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apkFile);

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(installIntent);
    }

    /** Call from the hosting Activity's onDestroy to avoid receiver leaks. */
    public void cleanup() {
        if (downloadReceiver != null) {
            try {
                context.unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            downloadReceiver = null;
        }
    }
}
