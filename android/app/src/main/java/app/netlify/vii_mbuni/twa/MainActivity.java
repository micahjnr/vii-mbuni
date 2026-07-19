package app.netlify.vii_mbuni.twa;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private UpdateManager updateManager;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        updateManager = new UpdateManager(this);
        updateManager.checkForUpdate();
    }

    @Override
    public void onDestroy() {
        if (updateManager != null) {
            updateManager.cleanup();
        }
        super.onDestroy();
    }
}
