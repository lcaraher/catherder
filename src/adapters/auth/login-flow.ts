import { timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAppConfig } from "@/adapters/app-config";
import { getAuthConfig } from "./config";
import { loginWithIdToken } from "./login";
import {
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
} from "./pkce";
import { safeReturnPath } from "./return-path";

// Authorization-code login against the hosted login domain, with PKCE.
// The in-flight verifier, state, and return path live in one signed cookie.

const COOKIE_NAME = "catherder_login";
const FLOW_MAX_AGE_SECONDS = 10 * 60;
const TOKEN_TIMEOUT_MS = 10_000;

export type LoginFlowFailure =
  | "provider_error"
  | "missing_code"
  | "missing_cookie"
  | "invalid_cookie"
  | "state_mismatch"
  | "token_exchange_failed"
  | "token_response_invalid";

/** Thrown by completeLoginFlow; `kind` is safe to log, nothing else is attached. */
export class LoginFlowError extends Error {
  readonly kind: LoginFlowFailure;

  constructor(kind: LoginFlowFailure) {
    super(`login flow failed: ${kind}`);
    this.kind = kind;
  }
}

interface FlowState {
  verifier: string;
  state: string;
  next?: string;
}

function flowKey(): Uint8Array {
  return new TextEncoder().encode(getAuthConfig().sessionSecret);
}

function loginDomain(): string {
  const domain = getAuthConfig().loginDomain;
  if (!domain) throw new Error("AUTH_LOGIN_DOMAIN is not set");
  return domain;
}

function redirectUri(): string {
  return `${getAppConfig().baseUrl}/auth/callback`;
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Stores the PKCE state in a signed cookie and returns the authorize URL to redirect to. */
export async function startLoginFlow(
  next: string | null | undefined,
): Promise<string> {
  const config = getAuthConfig();
  const verifier = generateCodeVerifier();
  const state = generateState();
  const flow: FlowState = { verifier, state };
  const safeNext = safeReturnPath(next);
  if (safeNext) flow.next = safeNext;

  const token = await new SignJWT({ ...flow })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_MAX_AGE_SECONDS}s`)
    .sign(flowKey());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FLOW_MAX_AGE_SECONDS,
  });

  const url = new URL(`https://${loginDomain()}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallengeS256(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// Reads and clears the flow cookie; null when absent, throws when unreadable.
async function readFlowCookie(): Promise<FlowState | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  jar.delete(COOKIE_NAME);
  try {
    const { payload } = await jwtVerify(token, flowKey());
    if (
      typeof payload.verifier !== "string" ||
      typeof payload.state !== "string"
    ) {
      throw new Error("flow cookie is missing fields");
    }
    return {
      verifier: payload.verifier,
      state: payload.state,
      next: typeof payload.next === "string" ? payload.next : undefined,
    };
  } catch {
    throw new LoginFlowError("invalid_cookie");
  }
}

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getAuthConfig().clientId,
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  let response: Response;
  try {
    response = await fetch(`https://${loginDomain()}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch {
    throw new LoginFlowError("token_exchange_failed");
  }
  if (!response.ok) throw new LoginFlowError("token_exchange_failed");

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new LoginFlowError("token_response_invalid");
  }
  const idToken =
    typeof json === "object" && json !== null && "id_token" in json
      ? (json as { id_token?: unknown }).id_token
      : undefined;
  if (typeof idToken !== "string" || idToken === "") {
    throw new LoginFlowError("token_response_invalid");
  }
  return idToken;
}

/**
 * Finishes the login from the callback query: checks state against the
 * cookie, exchanges the code, and creates the session. Returns the path to land on.
 */
export async function completeLoginFlow(
  query: URLSearchParams,
): Promise<string> {
  const flow = await readFlowCookie();
  if (query.get("error")) throw new LoginFlowError("provider_error");
  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) throw new LoginFlowError("missing_code");
  if (!flow) throw new LoginFlowError("missing_cookie");
  if (!sameString(flow.state, state)) {
    throw new LoginFlowError("state_mismatch");
  }

  // Only the ID token is used; nothing else from the exchange is kept.
  const idToken = await exchangeCode(code, flow.verifier);
  await loginWithIdToken(idToken);
  return safeReturnPath(flow.next) ?? "/";
}

/** Hosted logout URL that ends the login-domain session, or null without a login domain. */
export function hostedLogoutUrl(): string | null {
  const config = getAuthConfig();
  if (!config.loginDomain) return null;
  const url = new URL(`https://${config.loginDomain}/logout`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("logout_uri", `${getAppConfig().baseUrl}/`);
  return url.toString();
}
