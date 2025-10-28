import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tu.bundle',
  appName: 'wrapper-gpt',
  webDir: 'apps/mobile/out', // no se usa con server.url, pero dejalo
  server: {
    url: 'https://cam-quiz-mobile.vercel.app/', // ← tu URL en Vercel (https)
    cleartext: false
  },
  ios: {
    contentInset: 'always'
  }
};

export default config;
