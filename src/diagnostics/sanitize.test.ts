import { describe, expect, it } from 'vitest';
import { sanitizeForDiagnostics } from './sanitize';

describe('sanitizeForDiagnostics', () => {
  it('redacts secrets, URLs, paths and e-mail addresses', () => {
    const result = sanitizeForDiagnostics(
      'Authorization=Bearer-123 cookie=session-456 https://host/path?q=secret /Users/alice/file.png alice@example.com'
    );
    expect(result).not.toContain('Bearer-123');
    expect(result).not.toContain('session-456');
    expect(result).not.toContain('alice');
    expect(result).not.toContain('?q=');
    expect(result).toContain('[REDACTED]');
    expect(result).toContain('[PATH]');
    expect(result).toContain('[URL]');
    expect(result).toContain('[EMAIL]');
  });

  it('bounds output length', () => {
    expect(sanitizeForDiagnostics('x'.repeat(1000)).length).toBeLessThanOrEqual(243);
  });
});
