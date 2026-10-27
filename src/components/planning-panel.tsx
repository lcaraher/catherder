"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  savePlanningSettings,
  shareTimes,
} from "@/app/e/[eventId]/responses/planning-actions";
import {
  BestTimesList,
  TimesZoneLine,
  type CountedPerson,
  type ListSelection,
} from "@/components/best-times-banner";
import { SECONDARY_SM } from "@/components/button-classes";
import { Checkbox, Select } from "@/components/form-controls";
import { HelpTip } from "@/components/help-tip";
import { Pane } from "@/components/pane";
import {
  SaveButton,
  SaveMessage,
  UnsavedNote,
  useConfirmation,
  useSaveForm,
} from "@/components/save-form";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import type { ClockFormat } from "@/domain/availability";
import {
  findBestTimes,
  fitSharedTimes,
  hoursLabel,
  sessionLabel,
  type SharedStart,
} from "@/domain/best-times";
import type { OverlapGrid } from "@/domain/overlap";

export interface PlanningSettings {
  lengthSlots: number;
  minPeople: number;
  organizerMustAttend: boolean;
  /** Null when "nearly fits" is off. */
  nearlySlots: number | null;
}

// 1 hour to 4 hours in half-hours.
const LENGTH_CHOICES = [2, 3, 4, 5, 6, 7, 8];
// 1 to 3 hours in half-hours.
const WINDOW_HOUR_CHOICES = [2, 3, 4, 5, 6];
const SELECT_CLASS = "px-3 py-2 text-sm aria-invalid:border-error";
const TOP_SHARED = 3;

interface FormState {
  lengthSlots: number;
  minPeople: number;
  organizerMustAttend: boolean;
  nearlyOn: boolean;
  /** In half-hours; 1 reads as 30 minutes, more as hours. */
  nearlyWindow: number;
}

function toForm(settings: PlanningSettings): FormState {
  return {
    lengthSlots: settings.lengthSlots,
    minPeople: settings.minPeople,
    organizerMustAttend: settings.organizerMustAttend,
    nearlyOn: settings.nearlySlots !== null,
    nearlyWindow: settings.nearlySlots ?? 1,
  };
}

function toSettings(form: FormState): PlanningSettings {
  return {
    lengthSlots: form.lengthSlots,
    minPeople: form.minPeople,
    organizerMustAttend: form.organizerMustAttend,
    nearlySlots: form.nearlyOn ? form.nearlyWindow : null,
  };
}

function sameSettings(a: PlanningSettings, b: PlanningSettings): boolean {
  return (
    a.lengthSlots === b.lengthSlots &&
    a.minPeople === b.minPeople &&
    a.organizerMustAttend === b.organizerMustAttend &&
    a.nearlySlots === b.nearlySlots
  );
}

/** The choices plus any extra values, once each, ascending. */
function withValues(choices: number[], ...extra: number[]): number[] {
  return [...new Set([...choices, ...extra])].sort((a, b) => a - b);
}

/** A comma-separated list of week slots, as shareTimes takes it. */
function parseStarts(value: FormDataEntryValue | null): number[] {
  const text = String(value ?? "");
  return text === "" ? [] : text.split(",").map(Number);
}

type ShareButton = "top" | "selected" | "stop";

interface Props {
  eventId: string;
  /** Sharing, tick boxes and chips are for single-activity events only. */
  singleActivity: boolean;
  grid: OverlapGrid;
  /** The people the counts are out of, in display order. */
  people: CountedPerson[];
  organizerUserId: string;
  clockFormat: ClockFormat;
  zoneLabel: string;
  zoneApproximated: boolean;
  saved: PlanningSettings;
  /** The times shared on Playdates, in the viewer's zone. */
  shared: SharedStart[];
  unanswered: number;
}

/** The planning settings form and the times they give, worked out in the browser. */
export function PlanningPanel({
  eventId,
  singleActivity,
  grid,
  people,
  organizerUserId,
  clockFormat,
  zoneLabel,
  zoneApproximated,
  saved: initialSaved,
  shared: initialShared,
  unanswered,
}: Props) {
  const id = useId();
  const [saved, setSaved] = useState(initialSaved);
  const [form, setForm] = useState(() => toForm(initialSaved));
  const settings = toSettings(form);
  const dirty = !sameSettings(settings, saved);
  useUnsavedChangesGuard(() => dirty);

  const { formProps, confirmation, error, errorId, fieldProps, clearError } = useSaveForm({
    action: savePlanningSettings,
    onSaved: (formData) => {
      const nearly = String(formData.get("nearlySlots") ?? "");
      setSaved({
        lengthSlots: Number(formData.get("lengthSlots")),
        minPeople: Number(formData.get("minPeople")),
        organizerMustAttend: formData.get("organizerMustAttend") === "on",
        nearlySlots: nearly === "" ? null : Number(nearly),
      });
    },
  });

  const [shared, setShared] = useState(initialShared);
  const [ticked, setTicked] = useState(() => new Set(initialShared.map((time) => time.start)));
  const shareFormId = useId();
  const topKey = useId();
  const selectedKey = useId();
  const stopKey = useId();
  const pressed = useRef<ShareButton>("top");
  const share = useSaveForm({
    action: shareTimes,
    confirmKey: topKey,
    confirms: () =>
      pressed.current === "stop"
        ? { [stopKey]: "Saved" }
        : { [pressed.current === "top" ? topKey : selectedKey]: "Shared" },
    onSaved: (formData) => {
      const starts = parseStarts(formData.get("starts"));
      if (starts.length === 0) focusSentence.current = true;
      setShared(starts.map((start) => ({ start, lengthSlots: saved.lengthSlots })));
      setTicked(new Set(starts));
    },
  });
  const selectedConfirmation = useConfirmation(selectedKey);
  const sentenceRef = useRef<HTMLParagraphElement>(null);
  const focusSentence = useRef(false);
  // After Stop sharing removes its button, focus moves to the box's new sentence.
  useEffect(() => {
    if (!focusSentence.current) return;
    focusSentence.current = false;
    sentenceRef.current?.focus();
  }, [shared]);

  const countedIds = useMemo(() => people.map((person) => person.userId), [people]);
  const times = useMemo(
    () =>
      findBestTimes(grid, {
        countedIds,
        lengthSlots: settings.lengthSlots,
        minPeople: settings.minPeople,
        organizerId: settings.organizerMustAttend ? organizerUserId : null,
        nearlySlots: settings.nearlySlots ?? 0,
      }),
    [
      grid,
      countedIds,
      organizerUserId,
      settings.lengthSlots,
      settings.minPeople,
      settings.organizerMustAttend,
      settings.nearlySlots,
    ],
  );
  const sharedFits = useMemo(
    () => fitSharedTimes(grid, shared, countedIds),
    [grid, shared, countedIds],
  );

  const sharedKeys = new Set(shared.map((time) => `${time.start}:${time.lengthSlots}`));
  const selection: ListSelection = {
    isTicked: (start) => ticked.has(start),
    onTick: (start, tick) =>
      setTicked((current) => {
        const next = new Set(current);
        if (tick) next.add(start);
        else next.delete(start);
        return next;
      }),
    isShared: (start) => sharedKeys.has(`${start}:${settings.lengthSlots}`),
  };
  const topStarts = times.slice(0, TOP_SHARED).map((time) => time.start);
  const selectedStarts = times.filter((time) => ticked.has(time.start)).map((time) => time.start);
  const sharedLabels = sharedFits.map((time) =>
    sessionLabel(time.start, time.lengthSlots, clockFormat),
  );

  const lengthChoices = withValues(LENGTH_CHOICES, saved.lengthSlots, form.lengthSlots);
  const peopleChoices = withValues(
    Array.from({ length: Math.max(2, people.length) - 1 }, (_, index) => index + 2),
    saved.minPeople,
    form.minPeople,
  );
  const unit = form.nearlyWindow === 1 ? "minutes" : "hours";
  const windowChoices =
    unit === "minutes"
      ? [1]
      : WINDOW_HOUR_CHOICES.filter((slots) => slots < form.lengthSlots);

  const update = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  const changeLength = (lengthSlots: number) =>
    // A window that no longer fits the shorter session becomes 30 minutes.
    update(
      form.nearlyWindow >= lengthSlots ? { lengthSlots, nearlyWindow: 1 } : { lengthSlots },
    );

  return (
    <Pane>
      <h2 className="mb-3 border-b border-edge pb-2 text-lg font-semibold">Planning</h2>
      <p className="mb-3 text-xs text-hint">
        Only organizers see this tab. Set what a good time needs, then share the times you want
        your group to see on Playdates.
      </p>
      <form
        {...formProps}
        className="unsaved-frame mb-4 flex flex-col gap-3 rounded border border-edge p-3 text-sm"
      >
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="nearlySlots" value={settings.nearlySlots ?? ""} />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-length`} className="text-sm text-muted">
            Session length
          </label>
          <Select
            id={`${id}-length`}
            name="lengthSlots"
            value={form.lengthSlots}
            onChange={(e) => changeLength(Number(e.target.value))}
            {...fieldProps("lengthSlots")}
            className={SELECT_CLASS}
          >
            {lengthChoices.map((slots) => (
              <option key={slots} value={slots}>
                {hoursLabel(slots)}
                {slots === saved.lengthSlots ? " (the event's length)" : ""}
              </option>
            ))}
          </Select>
          <HelpTip
            name="Session length"
            text="How long one session runs. A time is listed only when people are free for all of it. This is the event’s own length, so saving a new one changes the event too."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-people`} className="text-sm text-muted">
            At least
          </label>
          <Select
            id={`${id}-people`}
            name="minPeople"
            value={form.minPeople}
            onChange={(e) => update({ minPeople: Number(e.target.value) })}
            {...fieldProps("minPeople")}
            className={SELECT_CLASS}
          >
            {peopleChoices.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </Select>
          <span className="text-sm text-muted">people</span>
          <HelpTip
            name="At least"
            text="Times fewer people than this can make aren’t listed."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            <Checkbox
              name="organizerMustAttend"
              checked={form.organizerMustAttend}
              onChange={(e) => update({ organizerMustAttend: e.target.checked })}
            />
            Only times the organizer can attend
          </label>
          <HelpTip
            name="Only times the organizer can attend"
            text="Lists only times the organizer is free for the whole session, for when you lead every session yourself."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            <Checkbox
              checked={form.nearlyOn}
              onChange={(e) => update({ nearlyOn: e.target.checked })}
            />
            Show players that nearly fit requirements within a window of
          </label>
          <Select
            aria-label="Window length"
            value={form.nearlyWindow}
            disabled={!form.nearlyOn}
            onChange={(e) => update({ nearlyWindow: Number(e.target.value) })}
            {...fieldProps("nearlySlots")}
            className={SELECT_CLASS}
          >
            {windowChoices.map((slots) => (
              <option key={slots} value={slots}>
                {slots === 1 ? "30" : String(slots / 2)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Window unit"
            value={unit}
            disabled={!form.nearlyOn}
            onChange={(e) => update({ nearlyWindow: e.target.value === "minutes" ? 1 : 2 })}
            className={SELECT_CLASS}
          >
            <option value="minutes">minutes</option>
            {form.lengthSlots > 2 && <option value="hours">hours</option>}
          </Select>
          <HelpTip
            name="Show players that nearly fit"
            text="Under each time below, also names players who miss it by no more than this much, and what they’d miss. Only organizers see them."
          />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <UnsavedNote
                onDiscard={() => {
                  setForm(toForm(saved));
                  clearError();
                }}
              />
            )}
            <SaveButton
              inactive={!dirty}
              className={SECONDARY_SM}
              confirmText="Saved"
              confirmation={confirmation}
            >
              Save
            </SaveButton>
          </div>
          <SaveMessage error={error} id={errorId} />
        </div>
      </form>

      {singleActivity && (
        <div className="mb-4 rounded border border-l-4 border-edge border-l-accent-gradient-a bg-surface-raised px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Shared on Playdates</p>
            {shared.length > 0 && (
              <button
                type="submit"
                form={shareFormId}
                name="starts"
                value=""
                onClick={() => {
                  pressed.current = "stop";
                }}
                className={SECONDARY_SM}
              >
                Stop sharing
              </button>
            )}
          </div>
          <p ref={sentenceRef} tabIndex={-1} className="mt-1 text-xs text-hint">
            {sharedLabels.length === 0
              ? "Nothing yet. Participants see no times until you share some."
              : `${sharedLabels.length === 1 ? "1 time" : `${sharedLabels.length} times`}: ${sharedLabels.join("; ")}.`}
          </p>
        </div>
      )}

      <h3 className="mb-2 font-heading text-base font-semibold">Times with these settings</h3>
      <TimesZoneLine zoneLabel={zoneLabel} zoneApproximated={zoneApproximated} />
      <BestTimesList
        key={JSON.stringify(settings)}
        times={times}
        lengthSlots={settings.lengthSlots}
        people={people}
        organizerUserId={organizerUserId}
        clockFormat={clockFormat}
        unanswered={unanswered}
        showNearly={form.nearlyOn}
        selection={singleActivity ? selection : undefined}
        empty={<p className="mt-2.5 text-sm text-muted">No time fits these settings yet.</p>}
      />
      {singleActivity && (
        <form {...share.formProps} id={shareFormId}>
          <input type="hidden" name="eventId" value={eventId} />
          <div className="mt-3 flex flex-wrap gap-2">
            <SaveButton
              name="starts"
              value={topStarts.join(",")}
              inactive={dirty || topStarts.length === 0}
              onClick={() => {
                pressed.current = "top";
              }}
              className={SECONDARY_SM}
              confirmText="Shared"
              confirmation={share.confirmation}
            >
              Share the top three
            </SaveButton>
            <SaveButton
              name="starts"
              value={selectedStarts.join(",")}
              inactive={dirty || selectedStarts.length === 0}
              onClick={() => {
                pressed.current = "selected";
              }}
              className={SECONDARY_SM}
              confirmText="Shared"
              confirmation={selectedConfirmation}
            >
              Share selected{selectedStarts.length > 0 && ` (${selectedStarts.length})`}
            </SaveButton>
          </div>
          {dirty && (
            <p className="mt-1.5 text-xs text-hint">
              Save the settings before sharing; shared times use the saved length.
            </p>
          )}
          <SaveMessage error={share.error} id={share.errorId} />
        </form>
      )}
    </Pane>
  );
}
