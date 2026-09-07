// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as sizing from "../src/components/molecules/media-gallery-sizing";

const root = new URL("../src/components/molecules/", import.meta.url);
const source = (name) => readFileSync(new URL(name, root), "utf8");

// Isolated hook/render harness: executes the real TSX without mocking global
// React/native modules used by the rest of the test suite.
function createHarness() {
  const slots = [];
  let cursor = 0;
  let updates = 0;
  let effects = [];
  const cache = new Map();
  const react = {
    memo: (component) => component,
    useCallback: (callback) => callback,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => {
        const value = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) updates++;
        slots[index] = value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous[i])) effects.push(callback);
      slots[index] = deps;
    },
  };
  const ratioFor = (item) => sizing.getIntrinsicMediaAspectRatio(item)
    ?? cache.get(item?.uri) ?? (item?.type === "youtube" ? 16 / 9 : 4 / 5);
  const modules = {
    react,
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "react-native": { View: "View", FlatList: "FlatList", Platform: { OS: "ios" } },
    "./media-gallery-sizing": sizing,
    "./post-card-media-constants": {
      MEDIA_ASPECT_RATIO_CACHE: cache,
      MEDIA_LOADED_CACHE: new Set(),
      SCREEN_WIDTH: 392,
      MEDIA_HORIZONTAL_PADDING: 32,
      getMediaAspectRatio: ratioFor,
    },
    "./media-gallery-shared": {
      GALLERY_WIDTH: 360,
      GALLERY_ASPECT_RATIO_CACHE: cache,
      computeGalleryHeight: sizing.computeGalleryFrameHeight,
      getGalleryItemAspectRatio: ratioFor,
      galleryStyles: {},
    },
  };
  return {
    cache,
    get updates() { return updates; },
    load(name) {
      const compiled = ts.transpileModule(source(name), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      const exports = {};
      new Function("require", "exports", compiled)((id) => modules[id] ?? {}, exports);
      return exports;
    },
    render(component, props) {
      cursor = 0;
      effects = [];
      const result = component(props);
      for (const effect of effects) effect();
      return result;
    },
  };
}

const image = (uri, dimensions = {}) => ({ uri, type: "image", ...dimensions });
const pager = (tree) => tree.props.children[0].props;
const height = (tree) => tree.props.style[1].height;
const layout = (width) => ({ nativeEvent: { layout: { width } } });

describe("feed asset geometry", () => {
  test("landscape, square, portrait and tall cap use actual available width", () => {
    for (const [dimensions, expected] of [
      [{ width: 1600, height: 800 }, 180],
      [{ width: 900, height: 900 }, 360],
      [{ width: 800, height: 1000 }, 450],
      [{ width: 500, height: 2000 }, 450],
    ]) {
      expect(sizing.computeGalleryFrameHeight(sizing.resolveGalleryItemAspectRatio(dimensions), 360)).toBe(expected);
    }
    expect(sizing.computeGalleryFrameHeight(1, 280)).toBe(280);
  });

  test("invalid metadata never blocks decoded dimensions or poisons a frame", () => {
    for (const value of [0, -1, NaN, Infinity, -Infinity]) {
      const dimensions = { width: value, height: 900, aspectRatio: value };
      expect(sizing.hasGalleryItemAspectRatio(dimensions)).toBe(false);
      expect(sizing.resolveGalleryItemAspectRatio(dimensions, 2)).toBe(2);
      expect(sizing.computeGalleryFrameHeight(value, 360)).toBe(450);
    }
    expect(sizing.resolveGalleryItemAspectRatio({ width: -4, height: -2 }, 1)).toBe(1);
    expect(sizing.resolveGalleryItemAspectRatio({ width: 900, height: 900 }, 2)).toBe(1);
  });

  test("single image decodes once, validates sizes, and isolates recycled assets and late events", () => {
    const h = createHarness();
    const { useMediaAspectRatio: useRatio } = h.load("post-card-media-shared.ts");
    const first = h.render(useRatio, image("wide"));
    expect(first.effectiveAspectRatio).toBe(4 / 5);
    first.updateMediaAspectRatioFromSize(1600, 800);
    expect(h.render(useRatio, image("wide")).effectiveAspectRatio).toBe(2);
    const updates = h.updates;
    first.updateMediaAspectRatioFromSize(1600, 800);
    first.updateMediaAspectRatioFromSize(-1600, -800);
    expect(h.updates).toBe(updates);
    const second = h.render(useRatio, image("square", { width: NaN }));
    expect(second.effectiveAspectRatio).toBe(4 / 5);
    first.updateMediaAspectRatioFromSize(400, 800);
    expect(h.render(useRatio, image("square")).effectiveAspectRatio).toBe(4 / 5);
    second.updateMediaAspectRatioFromSize(900, 900);
    expect(h.render(useRatio, image("square")).effectiveAspectRatio).toBe(1);
    expect(h.render(useRatio, image("wide")).effectiveAspectRatio).toBe(2);
    expect(h.render(useRatio, image("wide", { width: 800, height: 1000 })).effectiveAspectRatio).toBe(0.8);
  });

  test("measured frame width settles without layout/state churn", () => {
    const h = createHarness();
    const { useMediaFrameWidth } = h.load("post-card-media-shared.ts");
    let frame = h.render(useMediaFrameWidth);
    frame.onMediaLayout(layout(280));
    frame = h.render(useMediaFrameWidth);
    expect(frame.containerWidth).toBe(280);
    const updates = h.updates;
    for (const width of [280, 280.2, 0, NaN, Infinity]) frame.onMediaLayout(layout(width));
    expect(h.updates).toBe(updates);
  });

  test("gallery follows selected image/video, adjacent decode, width change and recycled identity", () => {
    const h = createHarness();
    const { MediaGallery } = h.load("media-gallery.tsx");
    const media = [image("wide"), { uri: "square-video", type: "video" }, image("portrait", { aspectRatio: 0.8 })];
    let tree = h.render(MediaGallery, { media });
    const scrolls = [];
    tree.props.children[0].props.ref.current = { scrollToOffset: (args) => scrolls.push(args) };
    const firstSlide = pager(tree).renderItem({ item: media[0], index: 0 });
    const detect = firstSlide.props.children.props.onAspectRatioDetected;
    detect("wide", 2);
    detect("square-video", 1);
    tree = h.render(MediaGallery, { media });
    expect(height(tree)).toBe(180);
    pager(tree).onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 360 } } });
    tree = h.render(MediaGallery, { media });
    expect(height(tree)).toBe(360);
    detect("wide", 3);
    tree = h.render(MediaGallery, { media });
    expect(height(tree)).toBe(360);
    expect(scrolls).toHaveLength(0);
    tree.props.onLayout(layout(280));
    tree = h.render(MediaGallery, { media });
    expect(height(tree)).toBe(280);
    expect(scrolls.at(-1)).toEqual({ offset: 280, animated: false });
    pager(tree).onViewableItemsChanged({ viewableItems: [{ index: 2 }] });
    tree = h.render(MediaGallery, { media });
    expect(height(tree)).toBe(350);
    const next = [image("new"), image("other")];
    tree = h.render(MediaGallery, { media: next });
    expect(height(tree)).toBe(350);
    expect(scrolls.at(-1)).toEqual({ offset: 0, animated: false });
    detect("new", 2);
    expect(h.cache.has("new")).toBe(false);
  });

  test("render contract contains full images, uses measured frames, and keeps overlays inside", () => {
    const single = source("post-card-image.tsx");
    expect(single).toContain('contentFit: "contain"');
    expect(single).toContain("updateMediaAspectRatioFromSize(source?.width, source?.height)");
    for (const name of ["post-card-image.tsx", "post-card-video.tsx", "post-card-youtube.tsx"]) {
      expect(source(name)).toContain("onLayout={onMediaLayout}");
      expect(source(name)).not.toContain("preserveFallback");
    }
    expect(source("gallery-image-item.tsx")).toContain('contentFit: "contain"');
    expect(source("media-gallery-shared.ts")).toMatch(/indicators: \{\s*position: "absolute"/);
    expect(source("post-card-video.tsx")).toContain('contentFit="contain"');
    expect(source("post-card-video.tsx")).not.toContain("updateMediaAspectRatioFromSize(source?.width");
    expect(source("gallery-video-item.tsx")).toContain("getVideoSourceUri(videoSource) !== item.uri");
    expect(readFileSync(new URL("../src/pages/post/post-detail-header.tsx", import.meta.url), "utf8")).toContain("{`[${topic}]`}");
  });
});
