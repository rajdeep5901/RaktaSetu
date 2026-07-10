import { useState, useCallback, useRef } from 'react';

let globalId = 0;

/**
 * Custom toast notification hook for the Cyber-Medical Command Center.
 * Returns [toasts, addToast, removeToast, ToastContainer].
 */
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 350);
  }, []);

  const addToast = useCallback(
    (message, variant = 'info', duration = 5000) => {
      const id = ++globalId;
      setToasts((prev) => [
        ...prev,
        { id, message, variant, exiting: false },
      ]);
      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => removeToast(id), duration);
      }
      return id;
    },
    [removeToast],
  );

  return { toasts, addToast, removeToast };
}

/**
 * Variant icon + color map
 */
const VARIANTS = {
  success: {
    border: 'border-emerald-500/50',
    icon: '✓',
    iconColor: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  error: {
    border: 'border-red-500/50',
    icon: '✕',
    iconColor: 'text-red-400',
    bg: 'bg-red-500/10',
  },
  warning: {
    border: 'border-amber-500/50',
    icon: '⚠',
    iconColor: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  info: {
    border: 'border-slate-500/50',
    icon: 'ℹ',
    iconColor: 'text-slate-300',
    bg: 'bg-slate-500/10',
  },
  system: {
    border: 'border-cyan-500/50',
    icon: '⚡',
    iconColor: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
};

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const v = VARIANTS[t.variant] || VARIANTS.info;
        return (
          <div
            key={t.id}
            className={`toast ${v.border} ${v.bg} ${t.exiting ? 'toast-exit' : ''}`}
            onClick={() => removeToast(t.id)}
            role="alert"
          >
            <span className={`text-lg ${v.iconColor} flex-shrink-0 mt-0.5`}>
              {v.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 leading-relaxed break-words">
                {t.message}
              </p>
            </div>
            <button
              className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
