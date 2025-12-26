module.exports = function (api) {
  api.cache(true); // Disable caching temporarily for debugging
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      ["react-native-unistyles/plugin", { root: "src" }],
      [
        "inline-import",
        { extensions: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"] },
      ],
      "react-native-worklets/plugin",
    ],
  };
};
