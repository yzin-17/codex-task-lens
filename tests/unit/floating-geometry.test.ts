import { describe, expect, it } from 'vitest';
import { checkboxPercentage, clampPosition, intersectBounds } from '../../src/ui/embedded/floating-geometry.js';
describe('bounded checkbox floating window', () => {
  const bounds = { left: 280, top: 40, width: 720, height: 680 }, size = { width: 460, height: 560 };
  it('clamps all four edges inside the conversation column, never the sidebar', () => {
    expect(clampPosition({ x: -1000, y: -1000 }, size, bounds)).toEqual({ x: 288, y: 48 });
    expect(clampPosition({ x: 5000, y: 5000 }, size, bounds)).toEqual({ x: 532, y: 152 });
    expect(clampPosition({ x: 400, y: 100 }, size, bounds)).toEqual({ x: 400, y: 100 });
  });
  it('intersects a split pane with a resized viewport', () => {
    expect(intersectBounds(bounds, { left: 0, top: 0, width: 600, height: 400 })).toEqual({ left: 280, top: 40, width: 320, height: 360 });
  });
  it('does not move an oversized box into the sidebar', () => {
    expect(clampPosition({ x: -1, y: -1 }, size, { left: 280, top: 40, width: 300, height: 300 })).toEqual({ x: 280, y: 40 });
  });
  it('shows actual checkbox ratios, including empty completion and full completion', () => {
    expect(checkboxPercentage(0, 4, true)).toBe(0);
    expect(checkboxPercentage(1, 4, true)).toBe(25);
    expect(checkboxPercentage(4, 4, true)).toBe(100);
  });
  it('never draws a full ring for no data, zero tasks, cached or partial totals', () => {
    for (const [completed, total, valid] of [[0, 0, true], [3, 4, false], [4, 4, false], [5, 4, true], [-1, 4, true]] as const) expect(checkboxPercentage(completed, total, valid)).toBeNull();
  });
});
