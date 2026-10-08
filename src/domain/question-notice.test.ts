import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askLabel, noticeLabel, questionMark, questionNotices } from "./question-notice.ts";

describe("questionMark", () => {
  const question = { version: 2 };

  it("is null for an answer at the current version", () => {
    assert.equal(questionMark(question, { questionVersion: 2 }, true), null);
  });

  it("is changed for an answer to an older version", () => {
    assert.equal(questionMark(question, { questionVersion: 1 }, true), "changed");
  });

  it("is new for no answer once submitted", () => {
    assert.equal(questionMark(question, null, true), "new");
  });

  it("is null for no answer before submitting", () => {
    assert.equal(questionMark(question, null, false), null);
  });
});

describe("questionNotices", () => {
  it("counts changed and added separately", () => {
    const notices = questionNotices({
      submitted: true,
      questions: [
        { id: "a", checkRequestedVersion: 2 },
        { id: "b", checkRequestedVersion: 3 },
        { id: "c", checkRequestedVersion: 1 },
      ],
      answers: [
        { questionId: "a", questionVersion: 1 },
        { questionId: "b", questionVersion: 2 },
      ],
    });
    assert.deepEqual(notices, { changed: 2, added: 1 });
  });

  it("skips a question never asked about", () => {
    const notices = questionNotices({
      submitted: true,
      questions: [
        { id: "a", checkRequestedVersion: null },
        { id: "b", checkRequestedVersion: null },
      ],
      answers: [{ questionId: "a", questionVersion: 1 }],
    });
    assert.deepEqual(notices, { changed: 0, added: 0 });
  });

  it("does not count an answer at the requested version", () => {
    const notices = questionNotices({
      submitted: true,
      questions: [{ id: "a", checkRequestedVersion: 2 }],
      answers: [{ questionId: "a", questionVersion: 2 }],
    });
    assert.deepEqual(notices, { changed: 0, added: 0 });
  });

  it("does not count a missing answer before submitting", () => {
    const notices = questionNotices({
      submitted: false,
      questions: [{ id: "a", checkRequestedVersion: 1 }],
      answers: [],
    });
    assert.deepEqual(notices, { changed: 0, added: 0 });
  });
});

describe("noticeLabel", () => {
  it("words a changed question for 1 and 2", () => {
    assert.equal(noticeLabel("changed", 1), "Question has changed");
    assert.equal(noticeLabel("changed", 2), "Questions have changed");
  });

  it("words an added question for 1 and 2", () => {
    assert.equal(noticeLabel("added", 1), "New Question added");
    assert.equal(noticeLabel("added", 2), "New Questions added");
  });
});

describe("askLabel", () => {
  it("words the check ask for 1 and 2", () => {
    assert.equal(askLabel("check", 1), "Ask the 1 person who answered to check their answer");
    assert.equal(askLabel("check", 2), "Ask the 2 people who answered to check their answer");
  });

  it("words the answer ask for 1 and 2", () => {
    assert.equal(askLabel("answer", 1), "Ask the 1 person who already responded to answer it");
    assert.equal(askLabel("answer", 2), "Ask the 2 people who already responded to answer it");
  });
});
