import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { questionsLeft } from "./respond-pips.ts";

describe("questionsLeft", () => {
  it("is zero when every question is answered", () => {
    const questions = [
      { required: true, answered: true },
      { required: false, answered: true },
    ];
    assert.equal(questionsLeft(questions, false), 0);
    assert.equal(questionsLeft(questions, true), 0);
  });

  it("counts an unanswered optional question until seen", () => {
    const questions = [{ required: false, answered: false }];
    assert.equal(questionsLeft(questions, false), 1);
    assert.equal(questionsLeft(questions, true), 0);
  });

  it("counts an unanswered required question either way", () => {
    const questions = [{ required: true, answered: false }];
    assert.equal(questionsLeft(questions, false), 1);
    assert.equal(questionsLeft(questions, true), 1);
  });

  it("counts every unanswered question unseen and only the required ones seen", () => {
    const questions = [
      { required: false, answered: false },
      { required: false, answered: false },
      { required: true, answered: false },
      { required: true, answered: true },
    ];
    assert.equal(questionsLeft(questions, false), 3);
    assert.equal(questionsLeft(questions, true), 1);
  });

  it("is zero for no questions", () => {
    assert.equal(questionsLeft([], false), 0);
    assert.equal(questionsLeft([], true), 0);
  });
});
