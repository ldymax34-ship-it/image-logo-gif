import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/styles.css', 'utf8');
const components = readFileSync('src/styles/components.css', 'utf8');

describe('CustomWorkbench layout contracts', () => {
  it('keeps the custom workspace at the full module height before an image is imported', () => {
    expect(styles).toMatch(/\.custom-workspace\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/);
  });

  it('gives the module content the whole remaining height now that the in-page nav row is gone', () => {
    expect(components).toMatch(/\.app-module-shell\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);/);
    expect(components).not.toMatch(/\.app-module-shell\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)/);
  });

  it('center the empty stage instead of letting it shrink to its copy', () => {
    expect(styles).toMatch(/\.custom-stage\s*\{[^}]*place-items:\s*center;/);
  });
});
