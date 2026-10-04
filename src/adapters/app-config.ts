// Deployment-wide settings read from environment variables.

export interface AppConfig {
  /** Public origin of this deployment, without a trailing slash. */
  baseUrl: string;
}

let cached: AppConfig | undefined;

/** Drops the cached config so the next getAppConfig() re-reads the environment. */
export function resetAppConfigForTests(): void {
  cached = undefined;
}

// Validated lazily on first use; importing this module never throws at build time.
export function getAppConfig(): AppConfig {
  if (!cached) {
    const raw = process.env.APP_BASE_URL;
    if (!raw) {
      throw new Error("Missing required environment variable APP_BASE_URL");
    }
    let origin: string;
    try {
      origin = new URL(raw).origin;
    } catch {
      throw new Error("APP_BASE_URL must be an absolute URL");
    }
    cached = { baseUrl: origin };
  }
  return cached;
}

// Redirects must use the public origin: behind the Lambda Web Adapter the request URL carries the bind address.
export function appUrl(path: string): URL {
  return new URL(path, getAppConfig().baseUrl);
}

/** APP_BASE_URL's origin, or undefined when it is unset or not an absolute URL; never throws. */
export function publicOrigin(): URL | undefined {
  try {
    return new URL(new URL(process.env.APP_BASE_URL ?? "").origin);
  } catch {
    return undefined;
  }
}

/** Footer build line from APP_BASE_URL and APP_COMMIT; never throws. */
export function buildLabel(): string {
  const commit = process.env.APP_COMMIT?.trim() || "";
  let host = "";
  try {
    host = new URL(process.env.APP_BASE_URL ?? "").hostname;
  } catch {
    host = "";
  }
  const label = !host || host === "localhost" ? "local" : host.split(".")[0];
  if (label === "app") return commit;
  return commit ? `${label} · ${commit}` : label;
}
