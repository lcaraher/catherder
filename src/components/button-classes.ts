// The three button kinds; every button and button-like link uses one of these.
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const PRIMARY_BASE = `rounded border-2 accent-gradient-border bg-transparent font-medium text-foreground wash-hover disabled:opacity-50 ${FOCUS_RING}`;
const SECONDARY_BASE = `rounded border border-edge-strong bg-transparent font-medium text-foreground hover:bg-btn-secondary-hover disabled:opacity-50 ${FOCUS_RING}`;
const DANGER_BASE = `rounded border border-btn-danger-border bg-transparent font-medium text-btn-danger-text hover:bg-btn-danger-wash disabled:opacity-50 ${FOCUS_RING}`;

/** The one save or submit action on a page. */
export const PRIMARY = `${PRIMARY_BASE} px-4 py-2`;
export const PRIMARY_SM = `${PRIMARY_BASE} px-3 py-1.5 text-sm`;

/** Everything that is neither the page's main action nor destructive. */
export const SECONDARY = `${SECONDARY_BASE} px-3 py-1.5 text-sm`;
export const SECONDARY_SM = `${SECONDARY_BASE} px-2 py-1 text-xs`;

/** Destructive actions: delete, remove, clear, archive, regenerate. */
export const DANGER = `${DANGER_BASE} px-3 py-1.5 text-sm`;
export const DANGER_SM = `${DANGER_BASE} px-2 py-1 text-xs`;
