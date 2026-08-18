export function ExportError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="export-center-error" role="alert">
      <span className="export-center-error-mark" aria-hidden="true">!</span>
      <span className="export-center-error-text">{error}</span>
    </div>
  );
}
