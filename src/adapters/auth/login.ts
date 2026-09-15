import type { User } from "@prisma/client";
import { prisma } from "@/adapters/db/client";
import { verifyIdToken, type VerifiedIdentity } from "./oidc";
import { createSession } from "./session";

// Fallback zone when the issuer provides no zoneinfo claim.
const DEFAULT_TIME_ZONE = "UTC";

/**
 * Verifies an OIDC ID token, upserts the User and ExternalIdentity rows,
 * and sets the httpOnly session cookie. Returns the logged-in user.
 */
export async function loginWithIdToken(idToken: string): Promise<User> {
  const identity = await verifyIdToken(idToken);
  const user = await upsertUserForIdentity(identity);
  await createSession(user.id);
  return user;
}

async function upsertUserForIdentity(
  identity: VerifiedIdentity,
): Promise<User> {
  const existing = await prisma.externalIdentity.findUnique({
    where: {
      issuer_subject: { issuer: identity.issuer, subject: identity.subject },
    },
    include: { user: true },
  });
  if (existing) return existing.user;

  // First login from this identity: attach it to the user with the same
  // email if one exists (e.g. seeded users), otherwise create the user.
  const user = await prisma.user.upsert({
    where: { email: identity.email },
    update: {},
    create: {
      email: identity.email,
      displayName: identity.displayName,
      timeZone: identity.timeZone ?? DEFAULT_TIME_ZONE,
    },
  });
  await prisma.externalIdentity.create({
    data: {
      userId: user.id,
      issuer: identity.issuer,
      subject: identity.subject,
    },
  });
  return user;
}
