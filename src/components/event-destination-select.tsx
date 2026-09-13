"use client";

import { useRouter } from "next/navigation";

interface Props {
  id: string;
  options: { workspaceId: string; name: string }[];
  currentWorkspaceId: string;
}

/**
 * Picks where a new event is created, for users who belong to more than one
 * workspace. Choosing an entry navigates to that workspace's new-event route,
 * so the whole form (GameMaster list included) is re-rendered server-side for
 * the chosen destination.
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
      className="w-full rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      {options.map((option) => (
        <option key={option.workspaceId} value={option.workspaceId}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
