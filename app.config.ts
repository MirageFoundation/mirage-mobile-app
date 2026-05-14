import { ConfigContext, ExpoConfig } from "expo/config";
import { withGradleProperties } from "expo/config-plugins";
import type { AndroidConfig, ConfigPlugin } from "expo/config-plugins";

const env = process.env.EXPO_PUBLIC_ENV || "";
const isFdroidBuild = process.env.EXPO_PUBLIC_FDROID === "true";
const bundleIdentifier = env
  ? `talk.mirage.mobile.${env}`
  : `talk.mirage.mobile`;
const scheme = env ? `mirage${env}` : `mirage`;

const name = env ? `Mirage (${env.toUpperCase()})` : "Mirage";

const fdroidGradleProperties: Record<string, string> = {
  "org.gradle.daemon": "false",
  "org.gradle.workers.max": "1",
  "org.gradle.vfs.watch": "false",
  "kotlin.compiler.execution.strategy": "in-process",
  "org.gradle.jvmargs":
    "-Xmx2048m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8",
};

const setGradleProperty = (
  gradleProperties: AndroidConfig.Properties.PropertiesItem[],
  key: string,
  value: string,
) => {
  const existingProperty = gradleProperties.find(
    (property) => property.type === "property" && property.key === key,
  );

  if (existingProperty?.type === "property") {
    existingProperty.value = value;
    return;
  }

  gradleProperties.push({ type: "property", key, value });
};

const withFdroidGradleProperties: ConfigPlugin = (config) =>
  withGradleProperties(config, (config) => {
    Object.entries(fdroidGradleProperties).forEach(([key, value]) => {
      setGradleProperty(config.modResults, key, value);
    });

    return config;
  });

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
  const notificationsPlugin: [string, Record<string, string>] = [
    "expo-notifications",
    {
      icon: "./assets/images/android-icon-monochrome.png",
      color: "#000000",
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
    ...(isFdroidBuild ? [withFdroidGradleProperties] : []),
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    "react-native-cloud-storage",
    "react-native-edge-to-edge",
    [
      "expo-font",
      {
        fonts: [],
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "$(PRODUCT_NAME) needs access to your Photos.",
      },
    ],
    ...(isFdroidBuild ? [] : [notificationsPlugin]),
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
    version: "1.0.14",
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
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
      versionCode: 1013,
      ...(isFdroidBuild
        ? {}
        : { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }),
      edgeToEdgeEnabled: true,
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
