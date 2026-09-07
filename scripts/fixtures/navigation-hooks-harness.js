export function navigationHooksHarness() {
  let cursor = 0;
  const slots = [];
  let effects = [];
  const hooks = {
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useEffect(effect, dependencies) {
      const i = cursor++;
      const previous = slots[i];
      if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return;
      effects.push(() => {
        previous?.cleanup?.();
        slots[i] = { dependencies, cleanup: effect() };
      });
    },
  };
  return {
    ...hooks,
    render(fn) {
      cursor = 0;
      const result = fn();
      const pending = effects;
      effects = [];
      pending.forEach((effect) => effect());
      return result;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
