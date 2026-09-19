import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/adapters/db/client";
import { loginPathFor } from "./return-path";
import { readSessionUserId } from "./session";

/** Thrown when a signed-in user may not do something; a 403-worthy error. */
export class ForbiddenError extends Error {}

/** Returns the logged-in user, or null if there is no valid session. */
export async function getSessionUser(): Promise<User | null> {
  const userId = await readSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Returns the logged-in user or redirects to login, returning to `next` after. */
export async function requireUser(next?: string): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect(loginPathFor(next));
  return user;
}
