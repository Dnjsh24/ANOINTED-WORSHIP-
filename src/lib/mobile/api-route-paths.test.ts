import { describe, expect, it } from 'vitest';
import { nativeMobileApiRoutes, isNativeMobileApiRoute } from './api-route-paths';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
const id = '22222222-2222-4222-8222-222222222222';
describe('native mobile connection boundaries', () => {
  it('keeps every shipped mobile handler reachable without a cookie redirect', () => {
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
    const actual = walk('src/app/api/mobile').filter(file => file.endsWith('route.ts')).map(file => '/' + file.replaceAll('\\', '/').replace('src/app/', '').replace(/\/route.ts$/, '')).sort();
    expect([...nativeMobileApiRoutes]).toEqual(actual);
    for (const route of nativeMobileApiRoutes) {
      const concrete = route.replace(/\[[^\]]+\]/g, id);
      expect(isNativeMobileApiRoute(concrete), concrete).toBe(true);
      expect(isNativeMobileApiRoute(concrete + '/extra'), concrete).toBe(false);
    }
    expect(isNativeMobileApiRoute('/api/mobile/v2/workspaces/invalid/profile')).toBe(false);
    expect(isNativeMobileApiRoute('/api/mobile/v2/not-a-route')).toBe(false);
    expect(isNativeMobileApiRoute('/profile')).toBe(false);
  });
});
