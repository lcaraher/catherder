"use client";

import { useRouter } from "next/navigation";

interface Props {
  id: string;
  options: { workspaceId: string; name: string }[];
  currentWorkspaceId: string;
}

/**
 * Picks where a new event is created; choosing an entry navigates to that
 * destination's new-event route.
 */
export function EventDestinationSelect({
  id,
  options,
  currentWorkspaceId,
}: Props) {
  const router = useRouter();
  return (
    <select
      id={id}
      value={currentWorkspaceId}
      onChange={(e) => router.push(`/w/${e.target.value}/events/new`)}
      className="w-full rounded border border-edge-strong bg-field px-3 py-2 text-sm"
    >
      {options.map((option) => (
        <option key={option.workspaceId} value={option.workspaceId}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
