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

  it("counts a marked answered question while seen and not opened", () => {
    const questions = [{ required: false, answered: true, marked: true }];
    assert.equal(questionsLeft(questions, true, false), 1);
    assert.equal(questionsLeft(questions, true, true), 0);
  });

  it("counts a marked unanswered required question once", () => {
    const questions = [{ required: true, answered: false, marked: true }];
    assert.equal(questionsLeft(questions, true, false), 1);
    assert.equal(questionsLeft(questions, false, false), 1);
  });

  it("treats a left-out opened as seen", () => {
    const questions = [
      { required: false, answered: false },
      { required: true, answered: false },
      { required: false, answered: true, marked: true },
    ];
    assert.equal(questionsLeft(questions, false), questionsLeft(questions, false, false));
    assert.equal(questionsLeft(questions, true), questionsLeft(questions, true, true));
    assert.equal(questionsLeft(questions.slice(0, 2), false), 2);
    assert.equal(questionsLeft(questions.slice(0, 2), true), 1);
  });
});
