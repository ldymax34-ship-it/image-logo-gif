const SECRET_PATTERN =
  /\b(authorization|cookie|token|api[_-]?key|password|private[_-]?key|secret)\b(\s*[:=]\s*)([^\s,;]+)/gi;
const PATH_PATTERN =
  /(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/|\/Volumes\/|\/private\/)[^\s"'`]*/g;
const URL_PATTERN = /https?:\/\/[^\s"'`]+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function sanitizeForDiagnostics(input: unknown, maxLength = 240): string {
  const raw = input instanceof Error
    ? `${input.name}: ${input.message}`
    : typeof input === 'string'
      ? input
      : String(input ?? 'unknown error');
  let result = raw
    .replace(URL_PATTERN, '[URL]')
    .replace(PATH_PATTERN, '[PATH]')
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .replace(SECRET_PATTERN, '$1$2[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  if (result.length > maxLength) result = `${result.slice(0, maxLength)}...`;
  return result;
}

export function diagnosticSummary(code: string, error: unknown, context?: string): string {
  const parts = [code, context ? `[${sanitizeForDiagnostics(context, 60)}]` : '', sanitizeForDiagnostics(error)];
  return parts.filter(Boolean).join(' ');
}
