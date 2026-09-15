import type { User, WorkspaceRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/adapters/db/client";
import { readSessionUserId } from "./session";

/** Thrown by requireRole; surfaces as a 403-worthy error to callers. */
export class ForbiddenError extends Error {}

/** Returns the logged-in user, or null if there is no valid session. */
export async function getSessionUser(): Promise<User | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Returns the logged-in user or redirects to the login page. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/dev-login");
  return user;
}

/** Requires a logged-in user whose WorkspaceMember role is one of `roles`. */
export async function requireRole(
  workspaceId: string,
  roles: WorkspaceRole[],
): Promise<{ user: User; role: WorkspaceRole }> {
  const user = await requireUser();
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
  });
  if (!membership || !roles.includes(membership.role)) {
    throw new ForbiddenError(
      `workspace membership with role ${roles.join(" or ")} required`,
    );
  }
  return { user, role: membership.role };
}
