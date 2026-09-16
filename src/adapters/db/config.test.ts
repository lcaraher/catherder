import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDatabaseConfig } from "./config.ts";

const SECRET_ENV = {
  DATABASE_SECRET_ARN: "arn:aws:secretsmanager:us-east-2:1:secret:x",
  DATABASE_HOST: "db.internal",
  DATABASE_NAME: "catherder",
  DATABASE_SSL_CA: "/app/certs/rds-global-bundle.pem",
};

describe("resolveDatabaseConfig", () => {
  it("uses URL mode when DATABASE_URL is set, even alongside secret variables", () => {
    const config = resolveDatabaseConfig({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
      ...SECRET_ENV,
    });
    assert.deepEqual(config, {
      mode: "url",
      connectionString: "postgresql://u:p@localhost:5432/db",
      max: 4,
    });
  });

  it("uses secret mode with the default port when DATABASE_URL is unset", () => {
    const config = resolveDatabaseConfig({ ...SECRET_ENV, DB_POOL_MAX: "1" });
    assert.deepEqual(config, {
      mode: "secret",
      secretArn: SECRET_ENV.DATABASE_SECRET_ARN,
      host: "db.internal",
      port: 5432,
      database: "catherder",
      sslCaPath: "/app/certs/rds-global-bundle.pem",
      max: 1,
    });
  });

  it("honours an explicit DATABASE_PORT and rejects a bad one", () => {
    const config = resolveDatabaseConfig({ ...SECRET_ENV, DATABASE_PORT: "6543" });
    assert.equal(config.mode === "secret" && config.port, 6543);
    assert.throws(
      () => resolveDatabaseConfig({ ...SECRET_ENV, DATABASE_PORT: "port" }),
      /DATABASE_PORT/,
    );
  });

  it("requires host, name, and CA path in secret mode", () => {
    for (const name of ["DATABASE_HOST", "DATABASE_NAME", "DATABASE_SSL_CA"]) {
      const env = { ...SECRET_ENV, [name]: "" };
      assert.throws(() => resolveDatabaseConfig(env), new RegExp(name));
    }
  });

  it("throws a clear error when neither mode is configured", () => {
    assert.throws(
      () => resolveDatabaseConfig({}),
      /DATABASE_URL, or DATABASE_SECRET_ARN/,
    );
  });

  it("is unconfigured during next build instead of throwing", () => {
    assert.deepEqual(
      resolveDatabaseConfig({ NEXT_PHASE: "phase-production-build" }),
      { mode: "unconfigured", max: 4 },
    );
  });

  it("validates DB_POOL_MAX in every mode", () => {
    assert.throws(
      () => resolveDatabaseConfig({ DATABASE_URL: "postgresql://x", DB_POOL_MAX: "0" }),
      /DB_POOL_MAX/,
    );
  });
});
