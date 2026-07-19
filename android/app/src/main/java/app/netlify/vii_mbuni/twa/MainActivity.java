package app.netlify.vii_mbuni.twa;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int MEDIA_PERMISSION_REQUEST_CODE = 9001;
    private static final int LOCATION_PERMISSION_REQUEST_CODE = 9002;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 9003;

    private UpdateManager updateManager;

    // Stashed while we wait on a runtime permission dialog triggered by the
    // web page's getUserMedia()/geolocation calls.
    private PermissionRequest pendingWebPermissionRequest;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        updateManager = new UpdateManager(this);
        updateManager.checkForUpdate();

        setupWebViewPermissions();
        requestNotificationPermissionIfNeeded();
    }

    /**
     * Lets the web app actually use the camera, microphone, and geolocation:
     * whenever the page calls getUserMedia()/geolocation, this asks the user
     * for the matching Android runtime permission (first time only) and
     * grants the WebView request once approved.
     */
    private void setupWebViewPermissions() {
        WebView webView = this.bridge.getWebView();

        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                handleGeolocationRequest(origin, callback);
            }
        });
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        List<String> androidPermissions = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                androidPermissions.add(Manifest.permission.CAMERA);
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                androidPermissions.add(Manifest.permission.RECORD_AUDIO);
            }
        }

        if (androidPermissions.isEmpty()) {
            request.deny();
            return;
        }

        if (allGranted(androidPermissions)) {
            request.grant(request.getResources());
            return;
        }

        pendingWebPermissionRequest = request;
        ActivityCompat.requestPermissions(this, androidPermissions.toArray(new String[0]), MEDIA_PERMISSION_REQUEST_CODE);
    }

    private void handleGeolocationRequest(String origin, GeolocationPermissions.Callback callback) {
        if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            callback.invoke(origin, true, false);
            return;
        }

        pendingGeoCallback = callback;
        pendingGeoOrigin = origin;
        ActivityCompat.requestPermissions(this,
                new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
                LOCATION_PERMISSION_REQUEST_CODE);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
            ActivityCompat.requestPermissions(this,
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    NOTIFICATION_PERMISSION_REQUEST_CODE);
        }
    }

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean allGranted(List<String> permissions) {
        for (String permission : permissions) {
            if (!hasPermission(permission)) return false;
        }
        return true;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == MEDIA_PERMISSION_REQUEST_CODE && pendingWebPermissionRequest != null) {
            PermissionRequest request = pendingWebPermissionRequest;
            pendingWebPermissionRequest = null;

            List<String> grantedResources = new ArrayList<>();
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && hasPermission(Manifest.permission.CAMERA)) {
                    grantedResources.add(resource);
                } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && hasPermission(Manifest.permission.RECORD_AUDIO)) {
                    grantedResources.add(resource);
                }
            }
            if (!grantedResources.isEmpty()) {
                request.grant(grantedResources.toArray(new String[0]));
            } else {
                request.deny();
            }
        } else if (requestCode == LOCATION_PERMISSION_REQUEST_CODE && pendingGeoCallback != null) {
            boolean allowed = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
            pendingGeoCallback.invoke(pendingGeoOrigin, allowed, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    public void onDestroy() {
        if (updateManager != null) {
            updateManager.cleanup();
        }
        super.onDestroy();
    }
}
