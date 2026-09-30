"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { unstable_rethrow } from "next/navigation";
import { SECONDARY, SECONDARY_SM } from "@/components/button-classes";
import { SAVE_FAILED, saveError, type SaveResult } from "@/domain/save-result";

const CONFIRM_MS = 2000;

export type SaveAction = (formData: FormData) => Promise<SaveResult>;

/** Confirmation text by the key of the button that shows it. */
export type Confirmations = Record<string, string>;

interface ConfirmationStore {
  shown: Confirmations;
  show: (entries: Confirmations) => void;
}

const ConfirmationContext = createContext<ConfirmationStore | null>(null);

/** Holds the page's current save confirmations for 2 s and announces them. */
export function SaveConfirmations({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Confirmations>({});
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((entries: Confirmations) => {
    window.clearTimeout(timer.current);
    setShown(entries);
    timer.current = window.setTimeout(() => setShown({}), CONFIRM_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const store = useMemo(() => ({ shown, show }), [shown, show]);

  return (
    <ConfirmationContext value={store}>
      {children}
      <p role="status" className="sr-only">
        {[...new Set(Object.values(shown))].join(". ")}
      </p>
    </ConfirmationContext>
  );
}

/** The confirmation currently shown for `key`, or null. */
export function useConfirmation(key: string): string | null {
  return useContext(ConfirmationContext)?.shown[key] ?? null;
}

/** Shows `entries` as the page's confirmations; a no-op outside SaveConfirmations. */
export function useShowConfirmations(): (entries: Confirmations) => void {
  const store = useContext(ConfirmationContext);
  return store?.show ?? noop;
}

function noop() {}

interface Options {
  action: SaveAction;
  /** The key this form's button listens to; shared with the button that replaces it. */
  confirmKey?: string;
  /** What a save confirms; defaults to "Saved" on this form's own button. */
  confirms?: Confirmations | ((formData: FormData) => Confirmations);
  /** Clears the form after a save, for forms that add something. */
  resetOnSave?: boolean;
  /** Returns false to cancel the submission. */
  beforeSubmit?: (form: HTMLFormElement) => boolean;
  /** Runs after a save succeeds, with the data that was saved. */
  onSaved?: (formData: FormData) => void;
  /** Compares the form's fields with their saved values, for `dirty` and `discard`. */
  trackChanges?: boolean;
}

/** A form's fields as one comparable string. */
function serialize(data: FormData): string {
  return JSON.stringify([...data.entries()].map(([name, value]) => [name, String(value)]));
}

/** Runs a form's server action, confirms a save and reports why one failed. */
export function useSaveForm({
  action,
  confirmKey,
  confirms,
  resetOnSave = false,
  beforeSubmit,
  onSaved,
  trackChanges = false,
}: Options) {
  const ownKey = useId();
  const key = confirmKey ?? ownKey;
  const errorId = `${ownKey}-error`;
  const formRef = useRef<HTMLFormElement>(null);
  const show = useShowConfirmations();
  const confirmation = useConfirmation(key);
  const [dismissed, setDismissed] = useState<SaveResult | null>(null);
  const baseline = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (trackChanges && formRef.current) baseline.current = serialize(new FormData(formRef.current));
  }, [trackChanges]);

  const [state, dispatch, pending] = useActionState(
    async (_previous: SaveResult | null, formData: FormData): Promise<SaveResult> => {
      let result: SaveResult;
      try {
        result = await action(formData);
      } catch (error) {
        unstable_rethrow(error);
        result = saveError(SAVE_FAILED);
      }
      if (result.ok) {
        show(typeof confirms === "function" ? confirms(formData) : (confirms ?? { [key]: "Saved" }));
        if (resetOnSave) formRef.current?.reset();
        if (trackChanges) baseline.current = serialize(formData);
        startTransition(() => {
          if (trackChanges) setDirty(false);
          onSaved?.(formData);
        });
      }
      return result;
    },
    null,
  );

  const error = state && !state.ok && state !== dismissed ? state : null;

  useEffect(() => {
    if (!state || state.ok || !state.field) return;
    const field = formRef.current?.elements.namedItem(state.field);
    if (field instanceof HTMLElement) field.focus();
  }, [state]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (beforeSubmit && !beforeSubmit(form)) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(form, submitter);
    startTransition(() => dispatch(formData));
  };

  const onChange = (event: ChangeEvent<HTMLFormElement>) => {
    const name = (event.target as { name?: string }).name;
    if (error?.field && name === error.field) setDismissed(state);
    if (trackChanges && baseline.current !== null) {
      setDirty(serialize(new FormData(event.currentTarget)) !== baseline.current);
    }
  };

  /** Puts every field back to its saved value. */
  const discard = () => {
    formRef.current?.reset();
    setDirty(false);
    setDismissed(state);
  };

  /** Invalid-state attributes for the field named `name`. */
  const fieldProps = (name: string) =>
    error?.field === name
      ? { "aria-invalid": true as const, "aria-describedby": errorId }
      : {};

  return {
    // The server checks every field; its message replaces the browser's bubble.
    formProps: { ref: formRef, action: dispatch, onSubmit, onChange, noValidate: true },
    confirmation,
    error,
    errorId,
    fieldProps,
    pending,
    dirty,
    discard,
    /** Hides the current message, for forms that put their own fields back. */
    clearError: () => setDismissed(state),
  };
}

/** "Unsaved changes" and a Discard button, at the start of a form's button row. */
export function UnsavedNote({
  onDiscard,
  size = "sm",
}: {
  onDiscard: () => void;
  size?: "sm" | "md";
}) {
  return (
    <>
      <span data-unsaved className={`${size === "sm" ? "text-xs" : "text-sm"} text-status-unlocked`}>
        Unsaved changes
      </span>
      <button type="button" onClick={onDiscard} className={size === "sm" ? SECONDARY_SM : SECONDARY}>
        Discard
      </button>
    </>
  );
}

type SaveButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** What the button shows, with a tick, while it confirms. */
  confirmText: string;
  /** The confirmation shown for this button's key; it confirms only its own text. */
  confirmation: string | null;
  /** Confirms with the tick alone over its label, at its own width. */
  tickOnly?: boolean;
  /** Nothing to save: dimmed and inert, but still focusable. */
  inactive?: boolean;
  labelClassName?: string;
};

/** Submit button whose words become its confirmation, with a tick, for 2 s. */
export function SaveButton({
  confirmText,
  confirmation,
  tickOnly = false,
  inactive = false,
  labelClassName = "",
  className = "",
  children,
  type = "submit",
  onClick,
  ...props
}: SaveButtonProps) {
  const confirming = confirmation === confirmText;
  const blocked = inactive && !confirming;
  const buttonClass = blocked ? `${className} aria-disabled:opacity-50` : className;
  const handleClick: typeof onClick = (event) => {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  if (tickOnly) {
    return (
      <button
        type={type}
        {...props}
        aria-disabled={blocked || undefined}
        onClick={handleClick}
        className={`relative ${buttonClass}`}
      >
        <span className={`${labelClassName} ${confirming ? "opacity-0" : ""}`}>{children}</span>
        {confirming && (
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="pop-in">✓</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type={type}
      {...props}
      aria-disabled={blocked || undefined}
      onClick={handleClick}
      className={buttonClass}
    >
      {confirming ? (
        <>
          <span className="sr-only">{children}</span>
          <span aria-hidden="true" className="whitespace-nowrap">
            {confirmText} <span className="pop-in">✓</span>
          </span>
        </>
      ) : (
        <span className={labelClassName}>{children}</span>
      )}
    </button>
  );
}

/** Why the last save failed, under the form's submit button. */
export function SaveMessage({ error, id }: { error: { message: string } | null; id: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-error">
      {error.message}
    </p>
  );
}

interface ActionFormProps {
  action: SaveAction;
  /** The button's words. */
  label: ReactNode;
  buttonClassName: string;
  confirmKey?: string;
  confirms?: Confirmations;
  /** What this button shows when it confirms; "Saved" unless it names a change. */
  confirmText?: string;
  /** For a button whose row goes away on success: a plain button, the save only announced. */
  plain?: boolean;
  /** Confirms with the tick alone, for buttons too small for words. */
  tickOnly?: boolean;
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;
  className?: string;
  /** Hidden inputs the action needs. */
  children?: ReactNode;
}

/** A one-button form for a server action, with its confirmation and message. */
export function ActionForm({
  action,
  label,
  buttonClassName,
  confirmKey,
  confirms,
  confirmText = "Saved",
  plain = false,
  tickOnly = false,
  buttonProps,
  className,
  children,
}: ActionFormProps) {
  const { formProps, confirmation, error, errorId } = useSaveForm({
    action,
    confirmKey,
    confirms,
  });

  return (
    <form {...formProps} className={className}>
      {children}
      {plain ? (
        <button type="submit" {...buttonProps} className={buttonClassName}>
          {label}
        </button>
      ) : (
        <SaveButton
          {...buttonProps}
          className={buttonClassName}
          confirmText={confirmText}
          confirmation={confirmation}
          tickOnly={tickOnly}
        >
          {label}
        </SaveButton>
      )}
      <SaveMessage error={error} id={errorId} />
    </form>
  );
}
