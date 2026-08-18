// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CNB_REPO_URL, GITHUB_REPO_URL, GlobalTopActions } from './GlobalTopActions';

describe('GlobalTopActions', () => {
  it('exposes the resolved GitHub and CNB repository links with brand icons', () => {
    const html = renderToStaticMarkup(<GlobalTopActions />);
    expect(html).toContain(`href="${GITHUB_REPO_URL}"`);
    expect(html).toContain(`href="${CNB_REPO_URL}"`);
    expect(html).toContain('aria-label="打开 GitHub 仓库"');
    expect(html).toContain('aria-label="打开 CNB 仓库"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('viewBox="0 0 320 320"');
  });
});
