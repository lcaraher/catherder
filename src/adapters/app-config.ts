// Deployment-wide settings read from environment variables.

export interface AppConfig {
  /** Public origin of this deployment, without a trailing slash. */
  baseUrl: string;
}

let cached: AppConfig | undefined;

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
