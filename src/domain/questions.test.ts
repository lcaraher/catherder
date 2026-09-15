import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAnswerComplete,
  type AnswerCompletenessInput,
  type QuestionType,
} from "./questions.ts";

const EMPTY: AnswerCompletenessInput = {
  optionIds: [],
  text: "",
  rankCount: 0,
  otherText: "",
};

describe("isAnswerComplete", () => {
  it("TEXT needs non-whitespace text", () => {
    const question = { type: "TEXT" as QuestionType, allowOther: false };
    assert.equal(isAnswerComplete(question, EMPTY), false);
    assert.equal(isAnswerComplete(question, { ...EMPTY, text: "  \n " }), false);
    assert.equal(isAnswerComplete(question, { ...EMPTY, text: "hi" }), true);
  });

  it("RANKING needs at least one rank", () => {
    const question = { type: "RANKING" as QuestionType, allowOther: false };
    assert.equal(isAnswerComplete(question, EMPTY), false);
    assert.equal(isAnswerComplete(question, { ...EMPTY, rankCount: 3 }), true);
  });

  for (const type of ["SINGLE_CHOICE", "MULTI_CHOICE"] as QuestionType[]) {
    describe(type, () => {
      it("a chosen option counts", () => {
        assert.equal(
          isAnswerComplete(
            { type, allowOther: false },
            { ...EMPTY, optionIds: ["a"] },
          ),
          true,
        );
      });

      it("nothing chosen and no Other is incomplete", () => {
        assert.equal(isAnswerComplete({ type, allowOther: true }, EMPTY), false);
      });

      it("Other with text counts when the question allows Other", () => {
        assert.equal(
          isAnswerComplete(
            { type, allowOther: true },
            { ...EMPTY, otherText: "something else" },
          ),
          true,
        );
      });

      it("whitespace-only Other text does not count", () => {
        assert.equal(
          isAnswerComplete(
            { type, allowOther: true },
            { ...EMPTY, otherText: "   " },
          ),
          false,
        );
      });

      it("Other text never counts when the question forbids Other", () => {
        assert.equal(
          isAnswerComplete(
            { type, allowOther: false },
            { ...EMPTY, otherText: "something else" },
          ),
          false,
        );
      });
    });
  }
});
