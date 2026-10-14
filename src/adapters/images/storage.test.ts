import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { handleUpload } from "./resize-handler.ts";
import { getImageStorage, ImageStorageUnavailableError, pendingKey } from "./storage.ts";

const silent = () => {};

// Sets the environment for one call and puts it back afterwards.
function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const env = process.env as Record<string, string | undefined>;
  const set = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  };
  set(values);
  try {
    return run();
  } finally {
    set(saved);
  }
}

describe("getImageStorage", () => {
  it("uses the bucket when IMAGES_BUCKET is set, without calling AWS", () => {
    const storage = withEnv({ IMAGES_BUCKET: "catherder-test-images" }, getImageStorage);
    assert.equal(storage.kind, "s3");
  });

  it("uses the local folder outside production when there is no bucket", () => {
    const storage = withEnv({ IMAGES_BUCKET: undefined, NODE_ENV: "development" }, getImageStorage);
    assert.equal(storage.kind, "local");
  });

  it("refuses in production when there is no bucket, never falling back to the local folder", () => {
    assert.throws(
      () => withEnv({ IMAGES_BUCKET: undefined, NODE_ENV: "production" }, getImageStorage),
      ImageStorageUnavailableError,
    );
  });
});

describe("the local stand-in", () => {
  let dir: string;
  const env = () => ({ IMAGES_BUCKET: undefined, NODE_ENV: "development", IMAGES_LOCAL_DIR: dir });

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "catherder-images-"));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("takes a picture from upload to ready, serves it as WebP, and removes it", async () => {
    const storage = withEnv(env(), getImageStorage);
    assert.equal(storage.kind, "local");
    if (storage.kind !== "local") return;

    const form = await storage.createUpload("e1", "i1", "image/png");
    assert.deepEqual(form, {
      url: "/api/images/local-upload",
      fields: { key: "pending/e1/i1", "Content-Type": "image/png" },
    });
    assert.deepEqual(await storage.state("e1", "i1"), { state: "pending" });

    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#336699" } })
      .png()
      .toBuffer();
    await storage.store.put(form.fields.key, png, "image/png");
    await handleUpload(form.fields.key, storage.store, silent);

    assert.deepEqual(await storage.state("e1", "i1"), { state: "ready" });
    const bytes = await storage.read("e1", "i1");
    assert.ok(bytes);
    assert.equal((await sharp(bytes).metadata()).format, "webp");

    await storage.remove("e1", "i1");
    assert.equal(await storage.read("e1", "i1"), null);
    assert.deepEqual(await storage.state("e1", "i1"), { state: "pending" });
    await storage.remove("e1", "i1");
  });

  it("records a refused upload with its reason", async () => {
    const storage = withEnv(env(), getImageStorage);
    if (storage.kind !== "local") throw new Error("expected the local stand-in");
    await storage.store.put(pendingKey("e1", "i2"), Buffer.from("not a picture"), "image/png");
    await handleUpload(pendingKey("e1", "i2"), storage.store, silent);
    assert.deepEqual(await storage.state("e1", "i2"), { state: "refused", reason: "not-an-image" });
    assert.equal(await storage.read("e1", "i2"), null);
  });

  it("refuses ids that could name another path", async () => {
    const storage = withEnv(env(), getImageStorage);
    await assert.rejects(storage.read("..", "i1"), /invalid picture id/);
    await assert.rejects(storage.createUpload("e1", "I1", "image/png"), /invalid picture id/);
  });
});
