import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  imageAddress,
  pictureSize,
  referencedImageIds,
  refusalMessage,
  sizeTitle,
  type PictureSize,
} from "./images.ts";

const ids = (markdown: string) => [...referencedImageIds(markdown)].sort();

describe("referencedImageIds", () => {
  it("finds an inline picture", () => {
    assert.deepEqual(ids("Look: ![map](img:abc123)"), ["abc123"]);
  });

  it("finds a picture by reference", () => {
    assert.deepEqual(ids("![map][m]\n\n[m]: img:abc123"), ["abc123"]);
  });

  it("finds every picture once", () => {
    assert.deepEqual(ids("![a](img:one) ![b](img:two) ![c](img:one)"), ["one", "two"]);
  });

  it("ignores a picture from a web address", () => {
    assert.deepEqual(ids("![a](https://example.com/one.png)"), []);
  });

  it("ignores a link to img:", () => {
    assert.deepEqual(ids("[a](img:abc123)"), []);
  });

  it("ignores a link by reference to an img: definition", () => {
    assert.deepEqual(ids("[a][m]\n\n[m]: img:abc123"), []);
  });

  it("ignores text that only looks like a reference", () => {
    assert.deepEqual(ids("The picture is img:abc123 and `![a](img:def456)`."), []);
  });

  it("ignores a reference whose definition is a web address", () => {
    assert.deepEqual(ids("![a][m]\n\n[m]: https://example.com/one.png"), []);
  });

  it("ignores ids that are not lowercase letters and digits, or too long", () => {
    assert.deepEqual(ids(`![a](img:ABC) ![b](img:a-b) ![c](img:${"a".repeat(41)})`), []);
  });
});

describe("pictureSize", () => {
  it("reads each size word", () => {
    assert.equal(pictureSize("small"), "small");
    assert.equal(pictureSize("medium"), "medium");
  });

  it("reads an empty or missing title as large", () => {
    assert.equal(pictureSize(""), "large");
    assert.equal(pictureSize(undefined), "large");
    assert.equal(pictureSize(null), "large");
  });

  it("reads any other title as large", () => {
    for (const title of ["Small", " small", "large", "big"]) {
      assert.equal(pictureSize(title), "large", title);
    }
  });
});

describe("sizeTitle", () => {
  it("keeps no title for large and the word otherwise", () => {
    assert.equal(sizeTitle("large"), "");
    assert.equal(sizeTitle("small"), "small");
    assert.equal(sizeTitle("medium"), "medium");
  });

  it("round-trips with pictureSize", () => {
    for (const size of ["small", "medium", "large"] as PictureSize[]) {
      assert.equal(pictureSize(sizeTitle(size)), size);
    }
  });
});

describe("imageAddress", () => {
  it("places the picture under its event", () => {
    assert.equal(imageAddress("e1", "i1"), "/e/e1/images/i1");
  });
});

describe("refusalMessage", () => {
  it("words each upload refusal", () => {
    assert.match(refusalMessage("type"), /^That file isn't a picture catherder can use/);
    assert.equal(refusalMessage("size"), "That picture is over 10 MB. Choose a smaller one.");
    assert.equal(refusalMessage("per-event"), "This event has reached its limit of 20 pictures.");
    assert.equal(refusalMessage("per-day"), "You've uploaded 30 pictures today. Try again tomorrow.");
    assert.equal(refusalMessage("unavailable"), "Pictures can't be uploaded right now.");
    assert.equal(
      refusalMessage("timed-out"),
      "The picture took too long to get ready. Try again in a moment.",
    );
  });

  it("words each resize refusal", () => {
    assert.equal(refusalMessage("too-large"), refusalMessage("size"));
    assert.equal(refusalMessage("unsupported-type"), refusalMessage("type"));
    assert.equal(refusalMessage("not-an-image"), "That file couldn't be read as a picture. Choose another.");
    assert.equal(
      refusalMessage("too-many-pixels"),
      "That picture has too many pixels (over 50 million). Choose a smaller one.",
    );
  });

  it("words an unknown reason as an unreadable file", () => {
    assert.equal(refusalMessage("something-new"), refusalMessage("not-an-image"));
    assert.equal(refusalMessage("constructor"), refusalMessage("not-an-image"));
  });
});
