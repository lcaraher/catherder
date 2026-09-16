import type { PoolClient } from "pg";
import type { CredentialSource } from "./secret";

// PostgreSQL error code for a rejected password.
const INVALID_PASSWORD = "28P01";

export function isInvalidPasswordError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === INVALID_PASSWORD
  );
}

/** pg password callback: each new connection reads the current cached secret. */
export function passwordProvider(
  source: CredentialSource,
): () => Promise<string> {
  return async () => (await source.get()).password;
}

type ConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

/** The part of a pg Pool the credential hook touches. */
export interface CredentialPool {
  options: { user?: string };
  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
}

/**
 * Every new connection first resolves the cached credentials, since the
 * username is only known once the secret is read. A rejected password
 * drops the cache so the next connection fetches the rotated secret.
 */
export function attachCredentialSource<T extends CredentialPool>(
  pool: T,
  source: CredentialSource,
): T {
  const connectWithCallback = pool.connect.bind(pool) as (
    cb: ConnectCallback,
  ) => void;
  const connectAsPromise = pool.connect.bind(pool) as () => Promise<PoolClient>;
  const noteFailure = (error: unknown): void => {
    if (isInvalidPasswordError(error)) source.invalidate();
  };
  const prepare = async (): Promise<void> => {
    pool.options.user = (await source.get()).username;
  };

  function hooked(): Promise<PoolClient>;
  function hooked(cb: ConnectCallback): void;
  function hooked(cb?: ConnectCallback): Promise<PoolClient> | void {
    if (cb) {
      prepare().then(
        () =>
          connectWithCallback((err, client, done) => {
            noteFailure(err);
            cb(err, client, done);
          }),
        (error: unknown) => cb(error as Error, undefined, () => undefined),
      );
      return;
    }
    return prepare()
      .then(() => connectAsPromise())
      .catch((error: unknown) => {
        noteFailure(error);
        throw error;
      });
  }

  pool.connect = hooked as T["connect"];
  return pool;
}
