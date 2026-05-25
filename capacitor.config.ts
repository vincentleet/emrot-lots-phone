import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.legacy.spyphone',
  appName: 'Legacy of the Spy Phone',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
