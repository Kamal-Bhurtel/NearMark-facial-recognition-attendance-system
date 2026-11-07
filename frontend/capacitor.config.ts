import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fras.app',
  appName: 'FRAS',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
