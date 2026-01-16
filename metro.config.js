// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Watch the local packages directory
const packagesDir = path.resolve(__dirname, 'packages');
config.watchFolders = [packagesDir];

// Ensure metro can resolve from packages
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  packagesDir,
];

module.exports = config;
