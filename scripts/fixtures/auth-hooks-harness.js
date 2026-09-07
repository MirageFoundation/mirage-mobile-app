export function hookHarness() {
  let cursor = 0;
  const values = [];
  const cleanups = [];
  const api = {
    useRef: (initial) => { const i = cursor++; return values[i] ??= { current: initial }; },
    useState: (initial) => {
      const i = cursor++;
      if (!(i in values)) values[i] = typeof initial === "function" ? initial() : initial;
      return [values[i], (next) => { values[i] = typeof next === "function" ? next(values[i]) : next; }];
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => { const i = cursor++; if (!(i in values)) { values[i] = true; const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } },
  };
  return { ...api, render: (fn) => { cursor = 0; return fn(); }, unmount: () => cleanups.splice(0).forEach((fn) => fn()) };
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
