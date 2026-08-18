export type SectionState = 'idle' | 'active' | 'warning' | 'error' | 'success' | 'disabled';

export function SectionHeader({
  id,
  title,
  description,
  state = 'idle',
  children
}: {
  id: string;
  title: string;
  description: string;
  state?: SectionState;
  children?: React.ReactNode;
}) {
  return <div className={`brand-control-heading section-header is-${state}`} data-section-state={state}>
    <div>
      <h3 id={id}>{title}</h3>
      <small>{description}</small>
    </div>
    {children}
  </div>;
}
