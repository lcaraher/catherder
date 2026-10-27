"use client";

import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { pickTab, tabRows } from "@/domain/tabs";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export interface WindowTab {
  id: string;
  label: string;
  greyed?: boolean;
  /** A count shown on the tab; spoken is what a screen reader hears instead. */
  pip?: { count: number; spoken: string };
}

interface Props {
  /** Accessible name of the tab row. */
  label: string;
  tabs: WindowTab[];
  panels: Record<string, ReactNode>;
  initialTab?: string | string[];
  /** The tab to open on when initialTab names no tab; the first tab if absent. */
  defaultTab?: string;
  /** Called with each newly active tab, and once on mount with the first. */
  onChange?: (id: string) => void;
  /** A greyed tab at the end of the row that leads to another page. */
  link?: { href: string; label: string };
}

/** Window-style tabs over one sheet; every panel stays mounted, only the active one shown. */
export function WindowTabs({ label, tabs, panels, initialTab, defaultTab, onChange, link }: Props) {
  const base = useId();
  const ids = tabs.map((tab) => tab.id);
  const [active, setActive] = useState(() => pickTab(initialTab, ids, defaultTab ?? ids[0]));
  if (ids.length > 0 && !ids.includes(active)) setActive(ids[0]);

  const notify = useEffectEvent((id: string) => onChange?.(id));
  useEffect(() => notify(active), [active]);

  // Phone rows: the chosen group last; the link joins a short last group, else takes the first row.
  const groups = tabRows(tabs);
  const chosen = groups.findIndex((row) => row.some((tab) => tab.id === active));
  const last = groups.length - 1;
  const linkJoins = link !== undefined && last >= 0 && groups[last].length < 3;
  const linkRows = link && !linkJoins ? 1 : 0;
  const groupRow = (index: number) =>
    linkRows + 1 + (index === chosen ? last : chosen !== -1 && index > chosen ? index - 1 : index);
  const place = (row: number, column: number) =>
    ({ "--tab-row": row, "--tab-column": column }) as CSSProperties;

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  // Marks the tab active and records it as ?tab= without loading a page.
  function activate(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  }

  // Arrow keys wrap through the tabs; Home and End jump to either end.
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (e.key === "ArrowRight") next = (index + 1) % ids.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    else return;
    e.preventDefault();
    activate(ids[next]);
    document.getElementById(tabId(ids[next]))?.focus();
  }

  return (
    <div>
      <div
        className="window-tabs"
        data-phone-rows={tabs.length + (link ? 1 : 0) > 3 ? "" : undefined}
        style={{ "--tab-rows": groups.length + linkRows } as CSSProperties}
      >
        <div role="tablist" aria-label={label} className="window-tab-list">
          {groups.map((row, rowIndex) => (
            <div key={row[0].id} role="none" className="window-tab-row">
              {row.map((tab, column) => {
                const selected = tab.id === active;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={tabId(tab.id)}
                    aria-selected={selected}
                    aria-controls={panelId(tab.id)}
                    tabIndex={selected ? 0 : -1}
                    data-greyed={tab.greyed ? "" : undefined}
                    onClick={() => activate(tab.id)}
                    onKeyDown={(e) => onKeyDown(e, ids.indexOf(tab.id))}
                    className={`window-tab ${FOCUS_RING}`}
                    style={place(groupRow(rowIndex), column + 1)}
                  >
                    {tab.label}
                    {tab.pip && tab.pip.count > 0 && (
                      <>
                        <span aria-hidden="true" className="pip">
                          {tab.pip.count}
                        </span>
                        <span className="sr-only">{`, ${tab.pip.spoken}`}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {link && (
          <div className="window-tab-row">
            <Link
              href={link.href}
              className={`window-tab no-underline ${FOCUS_RING}`}
              data-greyed=""
              style={linkJoins ? place(groupRow(last), groups[last].length + 1) : place(1, 1)}
            >
              {link.label}
              <span aria-hidden="true"> ↗</span>
            </Link>
          </div>
        )}
      </div>
      <div className="window-sheet">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId(tab.id)}
            aria-labelledby={tabId(tab.id)}
            tabIndex={0}
            hidden={tab.id !== active}
            className={FOCUS_RING}
          >
            {panels[tab.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
