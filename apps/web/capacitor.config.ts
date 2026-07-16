import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mapera.app',
  appName: 'MaPera',
  webDir: 'dist',
  android: {
    // Android 15 forces edge-to-edge (content under status bar/camera cutout and
    // gesture bar). 'auto' lets Capacitor inset the WebView natively where needed;
    // CSS env(safe-area-inset-*) stays 0 then, so the CSS fallbacks never double up.
    adjustMarginsForEdgeToEdge: 'auto',
  },
}

export default config
