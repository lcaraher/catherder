"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SECONDARY_SM } from "@/components/button-classes";
import { EyeIcon } from "@/components/eye-icon";
import { Checkbox } from "@/components/form-controls";
import { OrganizerBadge } from "@/components/organizer-badge";
import { TipButton } from "@/components/tip-button";
import { ZoneChip } from "@/components/zone-chip";
import type { ClockFormat } from "@/domain/availability";
import {
  lengthLabel,
  missedLabel,
  sessionLabel,
  type BestTime,
  type SharedTimeFit,
} from "@/domain/best-times";

const FIRST_SHOWN = 3;
const SHOW_MORE = 10;

// The OPEN status badge's classes, for the "Shared" chip.
const SHARED_CHIP =
  "ml-1.5 rounded bg-badge-open px-2 py-0.5 align-middle text-xs font-medium text-badge-open-text";

export interface CountedPerson {
  userId: string;
  displayName: string;
}

/** "Times in your time zone:" and the viewer's zone chip. */
export function TimesZoneLine({
  zoneLabel,
  zoneApproximated,
}: {
  zoneLabel: string;
  zoneApproximated: boolean;
}) {
  return (
    <p className="text-xs text-hint">
      Times in your time zone:{" "}
      <ZoneChip label={zoneLabel} approximated={zoneApproximated} />
    </p>
  );
}

/** Names separated by commas, the organizer marked. */
function NameList({
  userIds,
  names,
  organizerUserId,
}: {
  userIds: string[];
  names: Map<string, string>;
  organizerUserId: string;
}) {
  return userIds.map((userId, index) => (
    <Fragment key={userId}>
      {index > 0 && ", "}
      {names.get(userId)}
      {userId === organizerUserId && <OrganizerBadge className="ml-1 align-middle" />}
    </Fragment>
  ));
}

interface DetailsProps {
  time: BestTime;
  lengthSlots: number;
  names: Map<string, string>;
  total: number;
  organizerUserId: string;
  clockFormat: ClockFormat;
  showNearly: boolean;
  shared: boolean;
}

/** One time's label, counts and names. */
function TimeDetails({
  time,
  lengthSlots,
  names,
  total,
  organizerUserId,
  clockFormat,
  showNearly,
  shared,
}: DetailsProps) {
  const list = (userIds: string[]) => (
    <NameList userIds={userIds} names={names} organizerUserId={organizerUserId} />
  );
  return (
    <>
      <p className="text-sm font-semibold">
        {sessionLabel(time.start, lengthSlots, clockFormat)}
        {shared && <span className={SHARED_CHIP}>Shared</span>}
      </p>
      <p className="text-sm text-muted">
        {time.can.length} of {total} can make it
        {time.maybe.length > 0 && `, ${time.maybe.length} maybe`}
      </p>
      <p className="text-xs text-muted">
        <span className="font-medium text-foreground">Can: </span>
        {list(time.can)}
      </p>
      {time.maybe.length > 0 && (
        <p className="text-xs text-muted">
          <span className="font-medium text-foreground">Maybe: </span>
          {list(time.maybe)}
        </p>
      )}
      {showNearly &&
        time.nearly.map(({ userId, missed }) => (
          <p key={userId} className="text-xs text-muted">
            <span className="font-medium text-foreground">Nearly: </span>
            {list([userId])}, misses {missedLabel(missed, clockFormat)}
          </p>
        ))}
    </>
  );
}

function unansweredText(unanswered: number): string {
  return unanswered === 1 ? "1 hasn't answered yet." : `${unanswered} haven't answered yet.`;
}

/** Tick boxes and "Shared" chips for the list, by start. */
export interface ListSelection {
  isTicked: (start: number) => boolean;
  onTick: (start: number, ticked: boolean) => void;
  isShared: (start: number) => boolean;
}

interface ListProps {
  times: BestTime[];
  lengthSlots: number;
  people: CountedPerson[];
  organizerUserId: string;
  clockFormat: ClockFormat;
  unanswered: number;
  /** Adds a "Nearly: " line per person who nearly fits. */
  showNearly?: boolean;
  /** Numbered rows with a tick box each, instead of the plain ordered list. */
  selection?: ListSelection;
  /** Shown instead of the list when there are no times. */
  empty: ReactNode;
}

/** The ranked times, three at first, with the unanswered count and the more/fewer buttons. */
export function BestTimesList({
  times,
  lengthSlots,
  people,
  organizerUserId,
  clockFormat,
  unanswered,
  showNearly = false,
  selection,
  empty,
}: ListProps) {
  const [shown, setShown] = useState(FIRST_SHOWN);
  const moreRef = useRef<HTMLButtonElement>(null);
  const focusMore = useRef(false);
  useEffect(() => {
    if (!focusMore.current) return;
    focusMore.current = false;
    moreRef.current?.focus();
  }, [shown]);

  const names = new Map(people.map((person) => [person.userId, person.displayName]));
  const visible = times.slice(0, shown);
  const details = (time: BestTime) => (
    <TimeDetails
      time={time}
      lengthSlots={lengthSlots}
      names={names}
      total={people.length}
      organizerUserId={organizerUserId}
      clockFormat={clockFormat}
      showNearly={showNearly}
      shared={selection?.isShared(time.start) ?? false}
    />
  );

  return (
    <>
      {times.length === 0 ? (
        empty
      ) : selection ? (
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {visible.map((time, index) => (
            <li key={time.start} className="flex items-start gap-2.5">
              <span className="min-w-5 text-right text-sm font-semibold">{index + 1}.</span>
              <span className="mt-0.5 flex">
                <Checkbox
                  aria-label={`Choose ${sessionLabel(time.start, lengthSlots, clockFormat)}`}
                  checked={selection.isTicked(time.start)}
                  onChange={(e) => selection.onTick(time.start, e.target.checked)}
                />
              </span>
              <div className="min-w-0">{details(time)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="mt-2.5 flex list-decimal flex-col gap-2.5 pl-5 marker:font-semibold">
          {visible.map((time) => (
            <li key={time.start}>{details(time)}</li>
          ))}
        </ol>
      )}
      {(unanswered > 0 || times.length > FIRST_SHOWN) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          {unanswered > 0 && <p className="text-xs text-hint">{unansweredText(unanswered)}</p>}
          <div className="ml-auto flex gap-2">
            {times.length > shown && (
              <button
                ref={moreRef}
                type="button"
                onClick={() => setShown(shown + SHOW_MORE)}
                className={SECONDARY_SM}
              >
                Show more times
              </button>
            )}
            {visible.length > FIRST_SHOWN && (
              <button
                type="button"
                onClick={() => {
                  focusMore.current = true;
                  setShown(FIRST_SHOWN);
                }}
                className={SECONDARY_SM}
              >
                Show fewer
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const HIDDEN_KEY = "catherder-proposed-hidden";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// True unless this browser folded the proposed times; a storage error reads as open.
function readOpen() {
  try {
    return localStorage.getItem(HIDDEN_KEY) !== "1";
  } catch {
    return true;
  }
}

function storeOpen(open: boolean) {
  try {
    if (open) localStorage.removeItem(HIDDEN_KEY);
    else localStorage.setItem(HIDDEN_KEY, "1");
  } catch {}
  listeners.forEach((listener) => listener());
}

interface BannerProps {
  /** The organizer's shared times, ranked, in the viewer's zone. */
  times: SharedTimeFit[];
  /** The saved planning settings, for the settings line. */
  lengthSlots: number;
  minPeople: number;
  organizerMustAttend: boolean;
  people: CountedPerson[];
  organizerUserId: string;
  clockFormat: ClockFormat;
  zoneLabel: string;
  zoneApproximated: boolean;
  unanswered: number;
}

/** The times the organizer shared, at the top of Playdates; foldable. */
export function BestTimesBanner({
  times,
  lengthSlots,
  minPeople,
  organizerMustAttend,
  people,
  organizerUserId,
  clockFormat,
  zoneLabel,
  zoneApproximated,
  unanswered,
}: BannerProps) {
  const open = useSyncExternalStore(subscribe, readOpen, () => true);
  const contentId = useId();
  const names = new Map(people.map((person) => [person.userId, person.displayName]));
  // One tree folded or open, so the control keeps focus when pressed.
  return (
    <div
      className={`mb-3 rounded border border-l-4 border-edge border-l-accent-gradient-a bg-surface-raised px-3 ${open ? "py-2.5" : "py-1.5"}`}
    >
      <div className={`flex justify-between gap-2 ${open ? "items-start" : "items-center"}`}>
        {open ? (
          <p className="text-sm font-semibold">The organizer proposes these times:</p>
        ) : (
          <p className="text-sm">
            <span className="font-semibold">Proposed times:</span> {times.length}
          </p>
        )}
        <TipButton
          label={open ? "Hide proposed times" : "Show proposed times"}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => storeOpen(!open)}
          className={`${SECONDARY_SM} inline-flex items-center`}
        >
          <EyeIcon open={open} className="h-4 w-4" />
        </TipButton>
      </div>
      {open && (
        <div id={contentId}>
          <div className="mt-1">
            <TimesZoneLine zoneLabel={zoneLabel} zoneApproximated={zoneApproximated} />
          </div>
          <ol className="mt-2.5 flex list-decimal flex-col gap-2.5 pl-5 marker:font-semibold">
            {times.map((time) => (
              <li key={`${time.start}:${time.lengthSlots}`}>
                <TimeDetails
                  time={time}
                  lengthSlots={time.lengthSlots}
                  names={names}
                  total={people.length}
                  organizerUserId={organizerUserId}
                  clockFormat={clockFormat}
                  showNearly={false}
                  shared={false}
                />
              </li>
            ))}
          </ol>
          {unanswered > 0 && (
            <p className="mt-2.5 text-xs text-hint">{unansweredText(unanswered)}</p>
          )}
          <p className="mt-2 text-xs text-hint">
            Organizer’s settings: {lengthLabel(lengthSlots)} sessions, at least {minPeople} people
            {organizerMustAttend && ", times the organizer can attend"}.
          </p>
          <p className="mt-1 text-xs text-muted">
            The organizer will confirm and communicate the final selection.
          </p>
        </div>
      )}
    </div>
  );
}
