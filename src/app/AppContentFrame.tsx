import type { ReactNode } from 'react';
import { StartupEnvironmentCheck } from './StartupEnvironmentCheck';

/**
 * Renders the application content plus the first-launch / re-detect environment
 * check as a sibling fixed overlay. The check must never replace `children`:
 * keeping the whole workspace mounted is what preserves unsaved tool state when
 * a settings re-detect flips `environmentCheckActive` on and off.
 */
export function AppContentFrame({
  environmentCheckActive,
  onEnvironmentCheckComplete,
  children,
}: {
  environmentCheckActive: boolean;
  onEnvironmentCheckComplete: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {children}
      {environmentCheckActive ? (
        <StartupEnvironmentCheck onComplete={onEnvironmentCheckComplete} />
      ) : null}
    </>
  );
}
