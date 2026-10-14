import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_IMAGE_BYTES } from "../../domain/images.ts";
import { MAX_UPLOAD_BYTES } from "./resize.ts";

describe("upload size limits", () => {
  it("are the same in the app and in the resize function", () => {
    assert.equal(MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES);
  });
});
