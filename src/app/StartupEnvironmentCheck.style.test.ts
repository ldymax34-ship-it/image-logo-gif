import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');
const start = styles.indexOf('.env-check {');
const end = styles.indexOf('/* ── Settings re-detect row', start);
const environmentStyles = styles.slice(start, end);

describe('startup environment check style contract', () => {
  it('uses the application dark surfaces instead of undefined light fallbacks', () => {
    expect(environmentStyles).toContain('var(--color-app)');
    expect(environmentStyles).toContain('background: var(--color-panel);');
    expect(environmentStyles).toContain('background: var(--color-panel-muted);');
    expect(environmentStyles).toContain('background: var(--color-danger-soft);');
    expect(environmentStyles).not.toMatch(/--color-(bg|surface|danger-bg)/);
  });

  it('uses only the defined spacing and dialog shadow tokens', () => {
    expect(environmentStyles).toContain('padding: var(--space-6);');
    expect(environmentStyles).toContain('box-shadow: var(--shadow-dialog);');
    expect(environmentStyles).not.toContain('--space-7');
  });

  it('keeps running, completed, and blocked stages distinguishable without a light fallback', () => {
    expect(environmentStyles).toContain('.env-check-stage-running');
    expect(environmentStyles).toContain('.env-check-stage-done');
    expect(environmentStyles).toContain('.env-check-stage-blocked');
    expect(environmentStyles).toContain('background: var(--color-panel-raised);');
    expect(environmentStyles).toContain('background: var(--color-success-soft);');
    expect(environmentStyles).toContain('background: var(--color-danger-soft);');
    expect(environmentStyles).not.toMatch(/#fff|#f6f6f4|#fdf0f0|rgba\(0, 0, 0, 0\.06\)/i);
  });
});
