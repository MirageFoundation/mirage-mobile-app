import { ConfigContext, ExpoConfig } from "expo/config";

const env = process.env.EXPO_PUBLIC_ENV || "";
const bundleIdentifier = env
  ? `talk.mirage.mobile.${env}`
  : `talk.mirage.mobile`;
const scheme = env ? `mirage${env}` : `mirage`;

const name = env ? `Mirage (${env.toUpperCase()})` : "Mirage";

export default ({ config }: ConfigContext): ExpoConfig => {
  const slug = "mirage";

  return {
    ...config,
    name,
    slug,
    version: "1.0.3",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      requireFullScreen: true,
      bundleIdentifier: bundleIdentifier,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["fetch", "remote-notification"],
        LSApplicationQueriesSchemes: ["whatsapp", "tg", "instagram", "sms"],
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      package: bundleIdentifier,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      [
        "expo-share-intent",
        {
          iosActivationRules: {
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
            NSExtensionActivationSupportsImageWithMaxCount: 1,
          },
          androidIntentFilters: ["text/*", "image/*", "video/*"],
        },
      ],
      [
        "@sentry/react-native/expo",
        {
          url: "https://sentry.io/",
          project: "react-native",
          organization: "mirage-q4",
        },
      ],
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.0",
          },
          android: {
            compileSdkVersion: 35,
          },
        },
      ],
      "expo-sqlite",
      "react-native-cloud-storage",
      "react-native-edge-to-edge",
      [
        "expo-font",
        {
          fonts: [],
        },
      ],
      [
        "react-native-vision-camera",
        {
          cameraPermissionText: "$(PRODUCT_NAME) needs access to your Camera.",
          enableCodeScanner: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "$(PRODUCT_NAME) needs access to your Photos.",
        },
      ],
      "expo-notifications",
      [
        "expo-screen-orientation",
        {
          initialOrientation: "PORTRAIT",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "25839d12-3bbc-4a6a-b1ee-67c4a6de816f",
      },
    },
    updates: {
      url: "https://u.expo.dev/25839d12-3bbc-4a6a-b1ee-67c4a6de816f",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
  };
};
