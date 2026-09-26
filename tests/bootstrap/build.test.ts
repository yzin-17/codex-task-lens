import { expect, it } from 'vitest';
import { protocolVersion } from '../../src/bootstrap.js';
it('exposes the build protocol without opening ports or touching Codex', () => { expect(protocolVersion).toBe(1); });
