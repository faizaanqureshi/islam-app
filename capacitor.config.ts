import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hidayah.app",
  appName: "Hidayah",
  webDir: "out",
  // Dark warm background matching the app theme — prevents white flash on launch
  backgroundColor: "#0d0b08",
  ios: {
    contentInset: "always",
    // NSLocationWhenInUseUsageDescription and NSLocationAlwaysUsageDescription
    // are set in ios/App/App/Info.plist after running `cap add ios`
  },
  android: {
    // ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED
    // are added to android/app/src/main/AndroidManifest.xml after running `cap add android`
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#c9a664",
      sound: "default",
    },
    Geolocation: {
      // Permissions are declared in native manifests
    },
  },
};

export default config;
