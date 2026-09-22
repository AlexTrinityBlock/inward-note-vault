import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastValue = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastValue | null>(null);

/** How long a toast stays up before it removes itself. */
const LIFETIME_MS = 4000;

/**
 * Transient confirmations, replacing silent success.
 *
 * These are deliberately not modal and not focusable: a toast tells you what
 * just happened, it never asks for an answer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value: ToastValue = {
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
  };

  return (
    <ToastContext value={value}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast-${toast.tone}`} role="status">
      <span className="toast-message">{toast.message}</span>
      <button type="button" className="toast-close icon-btn ghost" onClick={onDismiss}>
        <span className="visually-hidden">{t("common.close")}</span>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

export function useToast(): ToastValue {
  const value = use(ToastContext);
  if (!value) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return value;
}
