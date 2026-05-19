import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'l7v.koto.app',
  appName: 'Koto',
  webDir: 'dist',
  server: {
    url: 'https://jrpg-production.up.railway.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,  // Proper Japanese IME handling
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#e8edf3',
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#e8edf3',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
