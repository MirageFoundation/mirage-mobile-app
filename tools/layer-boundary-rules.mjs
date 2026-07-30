function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasRuntimeModuleReference(source, specifier) {
  const modulePattern = escapeRegExp(specifier);
  const quoteWrappedModule = `["']${modulePattern}["']`;
  const patterns = [
    new RegExp(
      `(?:^|\\n)\\s*import\\s+(?!type\\b)[^;]*?\\bfrom\\s*${quoteWrappedModule}`,
      "m",
    ),
    new RegExp(`(?:^|\\n)\\s*import\\s*${quoteWrappedModule}`, "m"),
    new RegExp(`\\bimport\\s*\\(\\s*${quoteWrappedModule}\\s*\\)`, "m"),
    new RegExp(
      `(?:^|\\n)\\s*export\\s+(?!type\\b)[^;]*?\\bfrom\\s*${quoteWrappedModule}`,
      "m",
    ),
    new RegExp(`\\brequire\\s*\\(\\s*${quoteWrappedModule}\\s*\\)`, "m"),
  ];

  return patterns.some((pattern) => pattern.test(source));
}
