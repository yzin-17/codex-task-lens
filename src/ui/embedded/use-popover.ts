import { useEffect, useRef, useState, type RefObject } from 'react';
type Options = { popup: RefObject<HTMLDivElement | null>; trigger: RefObject<HTMLButtonElement | null> };
/** Manual top-layer popover: pinning never changes the native attribute or remounts a draft. */
export function usePopover({ popup, trigger }: Options) {
  const [open, setOpen] = useState(false), [pinned, setPinned] = useState(false);
  const pin = useRef(false), outside = useRef(false);
  const close = (restoreFocus = true) => {
    outside.current = !restoreFocus; popup.current?.hidePopover();
  };
  const togglePin = () => { pin.current = !pin.current; setPinned(pin.current); };
  useEffect(() => {
    const node = popup.current!, button = trigger.current!;
    let frame = 0, afterFrame = 0;
    const pointer = (event: PointerEvent) => {
      const own = event.composedPath().includes(node) || event.composedPath().includes(button);
      outside.current = !own;
      if (!own && !pin.current && node.matches(':popover-open')) node.hidePopover();
    };
    const before = (event: Event) => {
      cancelAnimationFrame(frame); cancelAnimationFrame(afterFrame);
      const transition = event as ToggleEvent;
      if (transition.newState === 'open') { outside.current = false; return; }
      if (!outside.current && transition.oldState === 'open') frame = requestAnimationFrame(() => {
        afterFrame = requestAnimationFrame(() => {
          if (!outside.current && button.isConnected && !node.matches(':popover-open')) button.focus({ preventScroll: true });
        });
      });
    };
    const toggle = () => setOpen(node.matches(':popover-open'));
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || !node.matches(':popover-open')) return;
      const path = event.composedPath();
      // Native select owns Escape while its options are active; never eat typing keys.
      if (path.some(item => item instanceof HTMLSelectElement || (item instanceof Element && item.hasAttribute('data-lens-escape-scope')))) return;
      const inside = path.includes(node) || path.includes(button);
      if (pin.current && !inside) return;
      if (inside) { event.preventDefault(); event.stopPropagation(); }
      close(inside);
    };
    window.addEventListener('pointerdown', pointer, true); window.addEventListener('keydown', escape, true);
    node.addEventListener('beforetoggle', before); node.addEventListener('toggle', toggle);
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(afterFrame);
      window.removeEventListener('pointerdown', pointer, true); window.removeEventListener('keydown', escape, true);
      node.removeEventListener('beforetoggle', before); node.removeEventListener('toggle', toggle);
      if (node.matches(':popover-open')) node.hidePopover();
    };
  }, []);
  return { open, pinned, close, togglePin };
}
