// @ts-nocheck -- Runs the installed Gorhom modal with a commit/RAF harness, no native bridge.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as React from "react";

const frames = new Map();
let frame;
let cursor;
let effects = [];
let refs = [];
let raf = [];
let focused = true;
let keyboardDismissals = 0;
let mounts = 0;
let removals = 0;
let presents = 0;
let dismisses = 0;
const render = (key, fn) => {
  if (!frames.has(key)) frames.set(key, []);
  frame = frames.get(key);
  cursor = 0;
  return fn();
};
const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
mock.module("react", () => ({
  ...React,
  memo: fn => fn,
  forwardRef: fn => fn,
  useState: initial => {
    const slots = frame;
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
  },
  useRef: initial => {
    const i = cursor++;
    if (!(i in frame)) frame[i] = { current: initial };
    return frame[i];
  },
  useMemo: (fn, deps) => {
    const i = cursor++;
    if (!frame[i] || changed(frame[i].deps, deps)) frame[i] = { deps, value: fn() };
    return frame[i].value;
  },
  useCallback: fn => fn,
  useEffect: (fn, deps) => {
    const i = cursor++;
    if (changed(frame[i], deps)) effects.push(fn);
    frame[i] = deps;
  },
  useImperativeHandle: (ref, fn) => { refs.push(() => { ref.current = fn(); }); },
}));
mock.module("react-native", () => ({ Keyboard: { dismiss: () => keyboardDismissals++ } }));
mock.module("expo-router/react-navigation", () => ({ useIsFocused: () => focused }));
mock.module("@gorhom/portal", () => ({ Portal: "Portal", usePortal: () => ({ removePortal: () => removals++ }) }));
mock.module("../../node_modules/@gorhom/bottom-sheet/src/hooks", () => ({
  useBottomSheetModalInternal: () => ({ hostName: "root", containerLayoutState: {}, mountSheet: () => mounts++, unmountSheet() {}, willUnmountSheet() {} }),
}));
mock.module("../../node_modules/@gorhom/bottom-sheet/src/utilities", () => ({ print() {} }));
mock.module("../../node_modules/@gorhom/bottom-sheet/src/components/bottomSheet", () => ({ default: "BottomSheet" }));
globalThis.__DEV__ = false;
globalThis.requestAnimationFrame = fn => { raf.push(fn); return raf.length; };
// Runtime-only source import avoids adding third-party implementation TS to the app check.
const modalSource = "../../node_modules/@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal";
const { default: Modal } = await import(modalSource);
const { useTeamCreateSheetPresentation } = await import("../../src/pages/curation/use-team-create-sheet-presentation");
const commitRefs = () => { const jobs = refs; refs = []; jobs.forEach(fn => fn()); };
const flushEffects = () => { const jobs = effects; effects = []; jobs.forEach(fn => fn()); };
const flushRaf = () => { const jobs = raf; raf = []; jobs.forEach(fn => fn()); };

// Reproduce the old page's initial hidden effect against actual installed Gorhom.
const brokenRef = { current: null };
const broken = () => render("broken-modal", () => Modal({ children: "form" }, brokenRef));
assert.equal(broken(), null);
commitRefs();
brokenRef.current.dismiss();
brokenRef.current.present();
flushRaf();
const poisonedPortal = broken();
commitRefs();
let portalDelivered = false;
poisonedPortal.props.handleOnMount(() => { portalDelivered = true; });
assert.equal(portalDelivered, false, "idle dismiss leaves Gorhom DISMISSING and rejects the first portal mount");

let visible = false;
let closes = 0;
let bridge;
let portal;
let inner;
let forceCloseRequested = false;
const close = () => { closes++; visible = false; };
function commit() {
  bridge = render("bridge", () => useTeamCreateSheetPresentation(visible, close));
  portal = render("modal", () => Modal({ onChange: bridge.onChange, onDismiss: bridge.onDismiss, children: "draft form" }, bridge.sheet));
  commitRefs();
  const methods = bridge.sheet.current;
  bridge.sheet.current = { ...methods,
    present: () => { presents++; methods.present(); },
    dismiss: () => { dismisses++; methods.dismiss(); },
  };
  if (!portal) inner = undefined;
  portal?.props.handleOnMount(() => {
    inner = portal.props.children.props.children;
    inner.props.ref.current = { forceClose: () => { forceCloseRequested = true; }, snapToIndex() {} };
  });
  flushEffects();
}
const indexOpened = () => { assert.ok(inner, "portal must deliver content before layout/index"); inner.props.onChange(0, 300, 0); commit(); };
const finishDismiss = () => { assert.equal(forceCloseRequested, true); forceCloseRequested = false; inner.props.onClose(); commit(); };
commit();
assert.equal(dismisses, 0, "hidden initial commit must not dismiss an unopened modal");
visible = true;
commit();
assert.equal(presents, 1, "effect sees the ref attached during commit");
commit();
assert.equal(presents, 1, "rerenders before Gorhom RAF cannot duplicate present");
flushRaf();
commit();
assert.ok(inner);
assert.equal(portal.props.hostName, "root");
indexOpened();
visible = false;
commit();
assert.equal(dismisses, 1);
finishDismiss();
assert.equal(dismisses, 1, "onDismiss does not poison the reset idle modal");
visible = true;
commit();
flushRaf();
commit();
indexOpened();
assert.equal(presents, 2, "reopened form reaches the portal");

// Close while Gorhom's present RAF is pending, then reopen during dismissal.
visible = false;
commit();
finishDismiss();
visible = true;
commit();
visible = false;
commit();
assert.equal(dismisses, 2, "do not dismiss while present is only RAF-scheduled");
flushRaf();
commit();
indexOpened();
assert.equal(dismisses, 3, "deferred close runs once after real index readiness");
visible = true;
commit();
assert.equal(presents, 3, "do not present during an outgoing dismissal");
finishDismiss();
assert.equal(visible, true, "old dismissal must not clear a newer open request");
assert.equal(presents, 4);
flushRaf();
commit();
indexOpened();

// Offscreen pages neither present a new portal nor keep their existing sheet open.
focused = false;
commit();
finishDismiss();
assert.equal(visible, false);
assert.equal(closes, 1);
visible = true;
commit();
assert.equal(presents, 4);
focused = true;
commit();
flushRaf();
commit();
indexOpened();
assert.equal(presents, 5);
// User backdrop/pan dismissal closes controlled visibility once.
inner.props.onClose();
commit();
assert.equal(closes, 2);
assert.equal(visible, false);
assert.equal(portal, null);
assert.equal(keyboardDismissals, 4);
assert.ok(mounts >= 5 && removals >= 4);
