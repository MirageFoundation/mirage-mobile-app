module.exports = function (api) {
  api.cache(true);
  const isProduction =
    process.env.BABEL_ENV === "production" ||
    process.env.NODE_ENV === "production";

  const plugins = [
    ["react-native-unistyles/plugin", { root: "src" }],
    [
      "inline-import",
      { extensions: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"] },
    ],
    "react-native-worklets/plugin",
  ];

  if (isProduction) {
    plugins.unshift("transform-remove-console");
  }

  return {
    presets: ["babel-preset-expo"],
    plugins,
  };
};
