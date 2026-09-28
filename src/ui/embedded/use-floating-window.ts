import { useLayoutEffect, useRef, type RefObject, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { clampPosition, type Point, type Rectangle } from './floating-geometry.js';
type Options = { popup: RefObject<HTMLDivElement | null>; trigger: RefObject<HTMLButtonElement | null>; open: boolean; bounds: () => Rectangle };
export function useFloatingWindow({ popup, trigger, open, bounds }: Options) {
  const position = useRef<Point | null>(null);
  const dragging = useRef<{ id: number; target: HTMLElement; origin: Point; start: Point } | null>(null);
  const placeRef = useRef<(preferred?: Point) => void>(() => undefined);
  const finish = () => {
    const drag = dragging.current; dragging.current = null;
    if (drag?.target.hasPointerCapture(drag.id)) drag.target.releasePointerCapture(drag.id);
    popup.current?.removeAttribute('data-dragging');
  };
  // Reset synchronously on every native close; toggle events can coalesce during a rapid reopen.
  useLayoutEffect(() => {
    const node = popup.current; if (!node) return;
    let frame = 0;
    const before = (event: Event) => {
      cancelAnimationFrame(frame);
      if ((event as ToggleEvent).newState === 'closed') {
        finish(); position.current = null; node.removeAttribute('data-positioned');
        for (const property of ['left', 'top', 'width', 'max-height']) node.style.removeProperty(property);
      } else {
        node.removeAttribute('data-positioned');
        frame = requestAnimationFrame(() => { if (node.matches(':popover-open')) placeRef.current(); });
      }
    };
    node.addEventListener('beforetoggle', before);
    return () => { cancelAnimationFrame(frame); node.removeEventListener('beforetoggle', before); };
  }, []);
  useLayoutEffect(() => {
    const node = popup.current, button = trigger.current;
    if (!open || !node || !button) return;
    const place = (preferred?: Point) => {
      if (!node.matches(':popover-open')) return;
      const area = bounds(), anchor = button.getBoundingClientRect();
      const aboveSpace = anchor.top - area.top - 16;
      const belowSpace = area.top + area.height - anchor.bottom - 16;
      const above = aboveSpace >= Math.min(360, area.height * .55) || aboveSpace >= belowSpace;
      const free = preferred || position.current ? area.height - 16 : above ? aboveSpace : belowSpace;
      node.style.width = `${Math.max(1, Math.min(460, area.width - 16))}px`;
      node.style.maxHeight = `${Math.max(1, Math.min(560, free))}px`;
      const size = node.getBoundingClientRect();
      const desired = preferred ?? position.current ?? { x: anchor.left, y: above ? anchor.top - size.height - 8 : anchor.bottom + 8 };
      const point = clampPosition(desired, size, area);
      if (preferred || position.current) position.current = point;
      node.style.left = `${point.x}px`; node.style.top = `${point.y}px`; node.dataset.positioned = 'true';
    };
    placeRef.current = place;
    const update = () => place(), observer = new ResizeObserver(update);
    observer.observe(node); observer.observe(button); observer.observe(document.documentElement);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    window.addEventListener('blur', finish);
    window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update);
    place();
    return () => {
      observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      window.removeEventListener('blur', finish); window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update);
      finish(); placeRef.current = () => undefined;
    };
  }, [open, bounds]);
  const holdPosition = () => {
    if (!popup.current) return;
    const box = popup.current.getBoundingClientRect(); position.current = { x: box.left, y: box.top };
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (event.button !== 0 || !event.isPrimary || !popup.current) return;
    if (target.closest('button,input,textarea,select,a') && !target.closest('[data-lens-move]')) return;
    event.preventDefault(); event.stopPropagation();
    const box = popup.current.getBoundingClientRect();
    dragging.current = { id: event.pointerId, target: event.currentTarget, origin: { x: box.left, y: box.top }, start: { x: event.clientX, y: event.clientY } };
    event.currentTarget.setPointerCapture(event.pointerId); popup.current.dataset.dragging = 'true';
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragging.current; if (!drag || drag.id !== event.pointerId) return;
    placeRef.current({ x: drag.origin.x + event.clientX - drag.start.x, y: drag.origin.y + event.clientY - drag.start.y });
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const movement: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = movement[event.key]; if (!direction || !popup.current) return;
    event.preventDefault(); event.stopPropagation();
    const box = popup.current.getBoundingClientRect(), step = event.shiftKey ? 40 : 10;
    placeRef.current({ x: box.left + direction.x * step, y: box.top + direction.y * step });
  };
  return { holdPosition, onKeyDown, dragHandlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish } };
}
