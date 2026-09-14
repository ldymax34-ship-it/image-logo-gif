import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');

describe('Logo scale control styles', () => {
  it('lets the range occupy the available control column beside the numeric input', () => {
    expect(styles).toMatch(/\.logo-scale-controls\s+input\[type='range'\]\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/);
  });
});
