import type { User } from "@prisma/client";
import { prisma } from "@/adapters/db/client";
import { getAuthConfig } from "./config";
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
  const user = await findOrCreateUser(identity);
  return syncSiteAdmin(user, identity);
}

// Sets siteAdmin from SITE_ADMIN_USERNAMES; with no list or no username the
// row is left alone. The list and the username are never logged.
async function syncSiteAdmin(
  user: User,
  identity: VerifiedIdentity,
): Promise<User> {
  const adminUsernames = getAuthConfig().siteAdminUsernames;
  if (!adminUsernames || !identity.username) return user;
  const siteAdmin = adminUsernames.includes(identity.username.toLowerCase());
  if (siteAdmin === user.siteAdmin) return user;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { siteAdmin },
    });
    await tx.auditEvent.create({
      data: {
        actorUserId: user.id,
        entity: "User",
        entityId: user.id,
        action: siteAdmin ? "site_admin_granted" : "site_admin_revoked",
      },
    });
    return updated;
  });
}

async function findOrCreateUser(identity: VerifiedIdentity): Promise<User> {
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
