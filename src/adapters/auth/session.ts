import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuthConfig } from "./config";

const COOKIE_NAME = "catherder_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function sessionKey(): Uint8Array {
  return new TextEncoder().encode(getAuthConfig().sessionSecret);
}

/** Signs a session JWT for the user and sets it as an httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(sessionKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Returns the user id from a valid session cookie, or null. */
export async function readSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    return payload.sub ?? null;
  } catch {
    // Expired, tampered, or signed with a rotated secret — treat as logged out.
    return null;
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
