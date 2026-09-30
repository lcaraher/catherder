import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUnsavedChangesGuard, type GuardTargets } from "./unsaved-changes-guard.ts";

type Listener = (event: never) => void;

// A window and document that record their listeners, and a confirm that counts.
function fakeTargets(answer: boolean) {
  const listeners = new Map<string, Listener>();
  const target = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const asked: string[] = [];
  const targets = {
    window: target,
    document: target,
    confirm: (message: string) => {
      asked.push(message);
      return answer;
    },
  } as unknown as GuardTargets;
  return { targets, listeners, asked };
}

function linkClick(
  anchor: Partial<{ target: string; href: string; download: boolean }> = {},
  keys: Partial<{ metaKey: boolean }> = {},
) {
  const link = {
    localName: "a",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    target: anchor.target ?? "",
    hasAttribute: (name: string) => name === "download" && Boolean(anchor.download),
    getAttribute: () => anchor.href ?? "/availability",
  };
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: keys.metaKey ?? false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => link },
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {},
  };
  return event;
}

describe("the page's unsaved-changes guard", () => {
  it("asks once for a link click when two forms have unsaved changes", () => {
    const { targets, listeners, asked } = fakeTargets(true);
    const guard = createUnsavedChangesGuard(targets);
    guard.register({ current: () => true });
    guard.register({ current: () => true });

    const event = linkClick();
    (listeners.get("click") as (e: typeof event) => void)(event);

    assert.equal(asked.length, 1);
    assert.equal(event.prevented, false);
  });

  it("keeps the page when the person cancels", () => {
    const { targets, listeners } = fakeTargets(false);
    const guard = createUnsavedChangesGuard(targets);
    guard.register({ current: () => false });
    guard.register({ current: () => true });

    const event = linkClick();
    (listeners.get("click") as (e: typeof event) => void)(event);

    assert.equal(event.prevented, true);
  });

  it("does not ask when no form has unsaved changes, or for modified clicks, other targets, downloads and anchors", () => {
    const clean = fakeTargets(true);
    createUnsavedChangesGuard(clean.targets).register({ current: () => false });
    const cleanClick = linkClick();
    (clean.listeners.get("click") as (e: typeof cleanClick) => void)(cleanClick);
    assert.equal(clean.asked.length, 0);

    const dirty = fakeTargets(true);
    createUnsavedChangesGuard(dirty.targets).register({ current: () => true });
    for (const event of [
      linkClick({}, { metaKey: true }),
      linkClick({ target: "_blank" }),
      linkClick({ download: true }),
      linkClick({ href: "#joining" }),
    ]) {
      (dirty.listeners.get("click") as (e: typeof event) => void)(event);
    }
    assert.equal(dirty.asked.length, 0);
  });

  it("warns on leaving the browser page while any form is dirty", () => {
    const { targets, listeners } = fakeTargets(true);
    const guard = createUnsavedChangesGuard(targets);
    guard.register({ current: () => true });
    let prevented = false;
    const event = { preventDefault: () => (prevented = true), returnValue: "" };
    (listeners.get("beforeunload") as (e: typeof event) => void)(event);
    assert.equal(prevented, true);
    assert.notEqual(event.returnValue, "");
  });

  it("listens only while at least one form is registered", () => {
    const { targets, listeners } = fakeTargets(true);
    const guard = createUnsavedChangesGuard(targets);
    assert.equal(listeners.size, 0);
    const first = guard.register({ current: () => true });
    const second = guard.register({ current: () => true });
    assert.deepEqual([...listeners.keys()].sort(), ["beforeunload", "click"]);
    first();
    assert.equal(listeners.size, 2);
    second();
    assert.equal(listeners.size, 0);
  });
});
