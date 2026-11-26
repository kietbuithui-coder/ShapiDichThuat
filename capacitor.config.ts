import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linguaflow.app',
  appName: 'LINGUA FLOW',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    LinguaFlowNative: {
      enableFloatingOverlay: true,
      respectWindowInsets: true,
      audioCaptureFallbackToMic: true,
    },
  },
};

export default config;
