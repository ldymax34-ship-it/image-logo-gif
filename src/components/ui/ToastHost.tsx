import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react';
import { subscribeToasts, type ToastMessage } from './toastBus';

const DISMISS_MS: Record<ToastMessage['kind'], number> = {
  success: 3000,
  info: 3200,
  error: 6000,
};

const TOAST_PRESENTATION: Record<ToastMessage['kind'], { title: string; Icon: LucideIcon }> = {
  success: { title: '操作完成', Icon: CircleCheck },
  error: { title: '操作失败', Icon: CircleAlert },
  info: { title: '提示', Icon: Info },
};

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef(new Map<number, number>());

  useEffect(() => {
    const unsubscribe = subscribeToasts((message) => {
      setToasts((previous) => [...previous.slice(-3), message]);
      const timer = window.setTimeout(() => {
        setToasts((previous) => previous.filter((item) => item.id !== message.id));
        timersRef.current.delete(message.id);
      }, DISMISS_MS[message.kind]);
      timersRef.current.set(message.id, timer);
    });
    return () => {
      unsubscribe();
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  function dismiss(id: number) {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((previous) => previous.filter((item) => item.id !== id));
  }

  if (!toasts.length) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite" aria-label="操作提示">
      {toasts.map((toast) => {
        const { title, Icon } = TOAST_PRESENTATION[toast.kind];
        return (
          <article key={toast.id} className={`toast-card is-${toast.kind}`}>
            <span className="toast-card-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.8} /></span>
            <div className="toast-card-copy">
              <strong>{title}</strong>
              <span>{toast.text}</span>
            </div>
            <button type="button" className="toast-card-close" onClick={() => dismiss(toast.id)} aria-label={`关闭${title}通知`} title="关闭">
              <X size={14} aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </div>
  );
}
