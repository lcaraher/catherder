const MESSAGE =
  "You have unsaved changes that will be lost if you leave this page.";
const XHTML = "http://www.w3.org/1999/xhtml";

/** What the page guard listens on; the real window and document in the browser. */
export interface GuardTargets {
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<Document, "addEventListener" | "removeEventListener">;
  confirm: (message: string) => boolean;
}

/** A form's own check, read at the moment someone tries to leave. */
export type DirtyCheck = { current: () => boolean };

/**
 * One page-wide warning before leaving while any registered form has unsaved
 * changes: listeners exist only while at least one form is registered.
 */
export function createUnsavedChangesGuard(targets: GuardTargets) {
  const checks = new Set<DirtyCheck>();
  const anyDirty = () => [...checks].some((check) => check.current());

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!anyDirty()) return;
    event.preventDefault();
    // Legacy channel some browsers still require; the text shown is theirs.
    event.returnValue = MESSAGE;
  }

  function onClickCapture(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    // Modified clicks open elsewhere and leave this page alone.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.localName !== "a" || anchor.namespaceURI !== XHTML) return;
    if (anchor.target !== "" && anchor.target !== "_self") return;
    if (anchor.hasAttribute("download")) return;
    if (anchor.getAttribute("href")?.startsWith("#")) return;
    if (!anyDirty()) return;
    if (!targets.confirm(`${MESSAGE} Leave anyway?`)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return {
    /** Adds a form's check; the returned function removes it. */
    register(check: DirtyCheck): () => void {
      checks.add(check);
      if (checks.size === 1) {
        targets.window.addEventListener("beforeunload", onBeforeUnload);
        targets.document.addEventListener("click", onClickCapture, true);
      }
      return () => {
        if (!checks.delete(check) || checks.size > 0) return;
        targets.window.removeEventListener("beforeunload", onBeforeUnload);
        targets.document.removeEventListener("click", onClickCapture, true);
      };
    },
  };
}
