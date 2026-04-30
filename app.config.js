module.exports = {
  expo: {
    name: "Upper House Parking",
    slug: "parking-app",
    version: "1.0.2",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    sdkVersion: "54.0.0",
    jsEngine: "hermes",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "kfirs863.ParkingApp",
    },
    android: {
      package: "kfirs863.ParkingApp",
      versionCode: 2,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0A0A0F",
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      permissions: [
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS",
      ],
    },
    plugins: [
      "@react-native-firebase/app",
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#F5A623",
          defaultChannel: "parking_alerts",
        },
      ],
    ],
    web: {
      favicon: './assets/favicon-32x32.png',
      bundler: 'metro',
      output: 'single',
      name: 'Upper House Parking',
      shortName: 'Upper House Parking',
      description: 'ניהול חניות משותף לשכנים',
      themeColor: '#0A0A0F',
      backgroundColor: '#0A0A0F',
      display: 'standalone',
      orientation: 'portrait',
    },
    extra: {
      eas: {
        projectId: "3aea0a64-fdc2-4772-bd79-385a6052debf",
      },
    },
  },
};
