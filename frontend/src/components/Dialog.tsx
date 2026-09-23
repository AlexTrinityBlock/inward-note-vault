import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useI18n } from "../i18n";
import { Icon } from "./Icon";

type ConfirmOptions = {
  title?: string;
  message: string;
  /** Label for the affirming button; defaults to a generic "Confirm". */
  confirmLabel?: string;
  /** Render the affirming button as destructive. */
  danger?: boolean;
};

type PromptOptions = {
  title?: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  /** Reject input that fails this test; the dialog stays open. */
  validate?: (value: string) => string | null;
};

type DialogValue = {
  /** Resolves `true` when affirmed, `false` when dismissed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves the trimmed value, or `null` when dismissed. */
  prompt: (options: PromptOptions) => Promise<string | null>;
};

type PendingDialog =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

const DialogContext = createContext<DialogValue | null>(null);

/**
 * Promise-based confirm and prompt, replacing the browser's own.
 *
 * `window.confirm` and `window.prompt` cannot be styled, cannot be translated
 * by the surrounding application, and block the whole event loop. These return
 * promises instead, so a caller reads the same way:
 *
 * ```ts
 * if (await dialog.confirm({ message: t("notes.deleteConfirm") })) { ... }
 * ```
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const pendingRef = useRef<PendingDialog | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const item: PendingDialog = { kind: "confirm", options, resolve };
        pendingRef.current = item;
        setPending(item);
      }),
    [],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        const item: PendingDialog = { kind: "prompt", options, resolve };
        pendingRef.current = item;
        setPending(item);
      }),
    [],
  );

  const close = useCallback(
    (result: boolean | string | null) => {
      const current = pendingRef.current;
      pendingRef.current = null;
      setPending(null);
      if (current) {
        if (current.kind === "confirm") {
          current.resolve(result === true);
        } else {
          current.resolve(typeof result === "string" ? result : null);
        }
      }
    },
    [],
  );

  return (
    <DialogContext value={{ confirm, prompt }}>
      {children}
      {pending ? <DialogModal pending={pending} onClose={close} /> : null}
    </DialogContext>
  );
}

function DialogModal({
  pending,
  onClose,
}: {
  pending: PendingDialog;
  onClose: (result: boolean | string | null) => void;
}) {
  const { t } = useI18n();
  // Read through the discriminant so a prompt's own options are narrowed: the
  // two option shapes only overlap partially.
  const isPrompt = pending.kind === "prompt";
  const danger = pending.kind === "confirm" ? (pending.options.danger ?? false) : false;
  const title = pending.options.title ?? t("dialog.confirmTitle");
  const [value, setValue] = useState(
    pending.kind === "prompt" ? (pending.options.defaultValue ?? "") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the field for a prompt, the safe button for a confirm.
  useEffect(() => {
    if (isPrompt) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }
  }, [isPrompt]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(isPrompt ? null : false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPrompt, onClose]);

  function submit() {
    if (pending.kind === "prompt") {
      const trimmed = value.trim();
      const problem = pending.options.validate?.(trimmed) ?? null;
      if (problem) {
        setError(problem);
        return;
      }
      onClose(trimmed);
      return;
    }
    onClose(true);
  }

  return (
    <div
      className="modal-overlay open"
      role="presentation"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself dismisses, not one that started
        // inside the card and drifted out.
        if (event.target === event.currentTarget) {
          onClose(isPrompt ? null : false);
        }
      }}
    >
      <div
        className="modal-card dialog-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="dialog-body-layout">
          <div className={`dialog-icon-badge${danger ? " danger" : ""}`} aria-hidden="true">
            <Icon name={danger ? "alert" : "info"} size={18} />
          </div>
          <div className="dialog-content">
            <h3 id="dialog-title" className="dialog-title">
              {title}
            </h3>
            {pending.options.message ? (
              <p className="dialog-message">{pending.options.message}</p>
            ) : null}
            {pending.kind === "prompt" ? (
              <div className="dialog-input-wrapper">
                {pending.options.label ? (
                  <label className="dialog-input-label" htmlFor="dialog-input">
                    {pending.options.label}
                  </label>
                ) : null}
                <input
                  id="dialog-input"
                  ref={inputRef}
                  className="dialog-text-input"
                  type="text"
                  autoComplete="off"
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                {error ? <p className="error dialog-error">{error}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="modal-footer dialog-footer">
          <button
            type="button"
            className="ghost"
            onClick={() => onClose(pending.kind === "prompt" ? null : false)}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={danger ? "danger" : "primary"}
            onClick={submit}
          >
            {pending.options.confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useDialog(): DialogValue {
  const value = use(DialogContext);
  if (!value) {
    throw new Error("useDialog must be used inside <DialogProvider>");
  }
  return value;
}
