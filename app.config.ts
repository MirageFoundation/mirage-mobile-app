import { ConfigContext, ExpoConfig } from "expo/config";

const env = process.env.EXPO_PUBLIC_ENV || "";
const isFdroidBuild = process.env.EXPO_PUBLIC_FDROID === "true";
const bundleIdentifier = env
  ? `talk.mirage.mobile.${env}`
  : `talk.mirage.mobile`;
const scheme = env ? `mirage${env}` : `mirage`;

const name = env ? `Mirage (${env.toUpperCase()})` : "Mirage";

export default ({ config }: ConfigContext): ExpoConfig => {
  const slug = "mirage";
  const sentryPlugin: [string, Record<string, string>] = [
    "@sentry/react-native/expo",
    {
      url: "https://sentry.io/",
      project: "react-native",
      organization: "mirage-q4",
    },
  ];
  const plugins: NonNullable<ExpoConfig["plugins"]> = [
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
    ...(isFdroidBuild ? [] : [sentryPlugin]),
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
          image: "./assets/images/splash-icon-dark.png",
        },
      },
    ],
    "expo-secure-store",
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow $(PRODUCT_NAME) to authenticate before showing your recovery phrase.",
      },
    ],
    "expo-video",
    "expo-web-browser",
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "16.4",
        },
      },
    ],
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    "react-native-cloud-storage",
    "react-native-compressor",
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
        photosPermission:
          "$(PRODUCT_NAME) uses your photo library so you can select photos and videos to share in posts. For example, you can choose a photo to attach to a new post.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/android-icon-monochrome.png",
        color: "#000000",
      },
    ],
    [
      "expo-screen-orientation",
      {
        initialOrientation: "PORTRAIT",
      },
    ],
  ];

  return {
    ...config,
    name,
    slug,
    version: "1.1.7",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: scheme,
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: false,
      requireFullScreen: true,
      bundleIdentifier: bundleIdentifier,
      associatedDomains: ["applinks:mirage.talk", "applinks:mirage.vote"],
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
      versionCode: 1014,
      ...(isFdroidBuild
        ? {}
        : { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }),
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: "mirage.talk", pathPrefix: "/" },
            { scheme: "https", host: "mirage.vote", pathPrefix: "/" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins,
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: "25839d12-3bbc-4a6a-b1ee-67c4a6de816f",
      },
    },
    updates: isFdroidBuild
      ? {
          enabled: false,
        }
      : {
          url: "https://u.expo.dev/25839d12-3bbc-4a6a-b1ee-67c4a6de816f",
        },
    runtimeVersion: {
      policy: "appVersion",
    },
  };
};
