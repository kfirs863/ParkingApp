module.exports = {
  expo: {
    name: "Upper House Parking",
    slug: "parking-app",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    sdkVersion: "54.0.0",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0A0A0F",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "kfirs863.ParkingApp",
    },
    android: {
      package: "kfirs863.ParkingApp",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#F5A623",
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
      permissions: [
        "android.permission.RECEIVE_BOOT_COMPLETED",
        "android.permission.VIBRATE",
        "android.permission.POST_NOTIFICATIONS",
      ],
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#F5A623",
          defaultChannel: "parking_alerts",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "3aea0a64-fdc2-4772-bd79-385a6052debf",
      },
    },
  },
};
