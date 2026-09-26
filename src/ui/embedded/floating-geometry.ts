export type Rectangle = { left: number; top: number; width: number; height: number };
export type Point = { x: number; y: number };
export function clampPosition(point: Point, size: { width: number; height: number }, bounds: Rectangle, margin = 8): Point {
  const insetX = Math.min(margin, Math.max(0, (bounds.width - size.width) / 2));
  const insetY = Math.min(margin, Math.max(0, (bounds.height - size.height) / 2));
  const left = bounds.left + insetX, top = bounds.top + insetY;
  return {
    x: Math.max(left, Math.min(point.x, bounds.left + bounds.width - size.width - insetX)),
    y: Math.max(top, Math.min(point.y, bounds.top + bounds.height - size.height - insetY)),
  };
}
export function intersectBounds(first: Rectangle, second: Rectangle): Rectangle {
  const left = Math.max(first.left, second.left), top = Math.max(first.top, second.top);
  return { left, top, width: Math.max(0, Math.min(first.left + first.width, second.left + second.width) - left), height: Math.max(0, Math.min(first.top + first.height, second.top + second.height) - top) };
}
export function checkboxPercentage(completed: number, total: number, valid: boolean): number | null {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || !valid || total <= 0 || completed < 0 || completed > total) return null;
  return Math.max(0, Math.min(100, completed / total * 100));
}
