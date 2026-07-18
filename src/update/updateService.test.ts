import { describe, expect, it } from 'vitest';
import { createTauriUpdateAdapter } from './updateService';

describe('Tauri updater adapter', () => {
  it('does not load updater APIs in web mode', () => {
    expect(createTauriUpdateAdapter().isAvailable()).toBe(false);
  });
});
