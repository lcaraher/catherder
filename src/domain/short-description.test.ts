import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlankMarkdown, shortDescriptionLength } from "./short-description.ts";

describe("shortDescriptionLength", () => {
  it("counts nothing for empty text", () => {
    assert.equal(shortDescriptionLength(""), 0);
  });

  it("counts plain text", () => {
    assert.equal(shortDescriptionLength("abc"), 3);
  });

  it("leaves out bold marks", () => {
    assert.equal(shortDescriptionLength("**abc**"), 3);
  });

  it("leaves out italic, strikethrough and code marks", () => {
    assert.equal(shortDescriptionLength("*a* ~~b~~ `c`"), 5);
  });

  it("counts a link's text and not its address", () => {
    assert.equal(shortDescriptionLength("[guide](https://example.com/a/long/path)"), 5);
  });

  it("counts one character between two paragraphs", () => {
    assert.equal(shortDescriptionLength("ab\n\ncd"), 5);
  });

  it("counts one character for a hard break", () => {
    assert.equal(shortDescriptionLength("ab  \ncd"), 5);
  });

  it("counts a heading typed in by its text", () => {
    assert.equal(shortDescriptionLength("# ab"), 2);
  });

  it("counts a list typed in by its text", () => {
    assert.equal(shortDescriptionLength("- ab"), 2);
  });
});

describe("isBlankMarkdown", () => {
  it("is blank for empty text and whitespace", () => {
    assert.equal(isBlankMarkdown(""), true);
    assert.equal(isBlankMarkdown(" \n\t "), true);
  });

  it("is blank for an empty heading", () => {
    assert.equal(isBlankMarkdown("##"), true);
  });

  it("is blank for bold marks with nothing inside", () => {
    assert.equal(isBlankMarkdown("**"), true);
  });

  it("is blank for an empty list item", () => {
    assert.equal(isBlankMarkdown("- "), true);
  });

  it("is blank for an empty quote", () => {
    assert.equal(isBlankMarkdown("> "), true);
  });

  it("is not blank for a heading with text", () => {
    assert.equal(isBlankMarkdown("## A"), false);
  });

  it("is not blank for inline code", () => {
    assert.equal(isBlankMarkdown("`x`"), false);
  });

  it("is not blank for an image with only an address", () => {
    assert.equal(isBlankMarkdown("![](https://a.example/b.png)"), false);
  });

  it("is not blank for a code block with text", () => {
    assert.equal(isBlankMarkdown("```\ncode\n```"), false);
  });
});
