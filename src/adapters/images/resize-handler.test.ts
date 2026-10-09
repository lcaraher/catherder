import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  failedKey,
  handleUpload,
  outputKey,
  parsePendingKey,
  type ObjectStore,
} from "./resize-handler.ts";

// In-memory store that records every write and delete; put can be made to fail.
function fakeStore(objects: Record<string, Buffer>, options: { failPut?: boolean } = {}) {
  const puts: { key: string; body: Buffer; contentType: string }[] = [];
  const deletes: string[] = [];
  const store: ObjectStore = {
    get: async (key) => {
      const body = objects[key];
      if (!body) throw new Error(`no object ${key}`);
      return body;
    },
    put: async (key, body, contentType) => {
      if (options.failPut) throw new Error("put failed");
      puts.push({ key, body, contentType });
    },
    delete: async (key) => {
      deletes.push(key);
    },
  };
  return { store, puts, deletes };
}

const lines: string[] = [];
const log = (line: string) => lines.push(line);

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 30, height: 20, channels: 3, background: "#c82828" } }).png().toBuffer();
}

describe("parsePendingKey", () => {
  it("reads the event and image ids", () => {
    assert.deepEqual(parsePendingKey("pending/e1/i1"), { eventId: "e1", imageId: "i1" });
  });

  it("decodes the key before matching it", () => {
    assert.deepEqual(parsePendingKey("pending/e1/i%31"), { eventId: "e1", imageId: "i1" });
    assert.equal(parsePendingKey("pending/e+1/i1"), null);
  });

  it("ignores keys outside pending/, with uppercase letters or extra segments", () => {
    assert.equal(parsePendingKey("images/e1/i1"), null);
    assert.equal(parsePendingKey("pending/E1/i1"), null);
    assert.equal(parsePendingKey("pending/e1/i1/x"), null);
    assert.equal(parsePendingKey("pending/e1"), null);
  });

  it("ignores a key that is not valid URL encoding", () => {
    assert.equal(parsePendingKey("pending/e1/i%E0%A4%A"), null);
  });
});

describe("outputKey and failedKey", () => {
  it("place the result beside the ids", () => {
    assert.equal(outputKey("e1", "i1"), "images/e1/i1.webp");
    assert.equal(failedKey("e1", "i1"), "failed/e1/i1");
  });
});

describe("handleUpload", () => {
  it("writes a good upload as WebP and removes it from pending/", async () => {
    const { store, puts, deletes } = fakeStore({ "pending/e1/i1": await png() });
    await handleUpload("pending/e1/i1", store, log);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].key, "images/e1/i1.webp");
    assert.equal(puts[0].contentType, "image/webp");
    assert.equal((await sharp(puts[0].body).metadata()).format, "webp");
    assert.deepEqual(deletes, ["pending/e1/i1"]);
  });

  it("records a refused upload under failed/ and removes it from pending/", async () => {
    const { store, puts, deletes } = fakeStore({ "pending/e1/i1": Buffer.from("not an image at all") });
    await handleUpload("pending/e1/i1", store, log);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].key, "failed/e1/i1");
    assert.equal(puts[0].contentType, "application/json");
    assert.deepEqual(JSON.parse(puts[0].body.toString("utf8")), { reason: "not-an-image" });
    assert.deepEqual(deletes, ["pending/e1/i1"]);
  });

  it("handles an encoded key as the key it stands for", async () => {
    const { store, puts, deletes } = fakeStore({ "pending/e1/i1": await png() });
    await handleUpload("pending/e1/i%31", store, log);
    assert.equal(puts[0].key, "images/e1/i1.webp");
    assert.deepEqual(deletes, ["pending/e1/i1"]);
  });

  it("ignores keys it does not own, writing and deleting nothing", async () => {
    for (const key of ["pending/e+1/i1", "images/e1/i1", "pending/E1/i1", "pending/e1/i1/x"]) {
      const { store, puts, deletes } = fakeStore({});
      await handleUpload(key, store, log);
      assert.deepEqual(puts, [], key);
      assert.deepEqual(deletes, [], key);
    }
  });

  it("lets a failed write propagate and keeps the pending upload", async () => {
    const { store, deletes } = fakeStore({ "pending/e1/i1": await png() }, { failPut: true });
    await assert.rejects(handleUpload("pending/e1/i1", store, log), /put failed/);
    assert.deepEqual(deletes, []);
  });

  it("logs the key and the outcome, never the bytes", async () => {
    lines.length = 0;
    const { store } = fakeStore({ "pending/e1/i1": await png() });
    await handleUpload("pending/e1/i1", store, log);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /pending\/e1\/i1/);
    assert.match(lines[0], /images\/e1\/i1\.webp/);
    assert.ok(lines[0].length < 200);
  });
});
