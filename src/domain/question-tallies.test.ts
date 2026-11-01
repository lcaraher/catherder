import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  choiceTallies,
  rankingTallies,
  type TallyAnswer,
  type TallyQuestion,
} from "./question-tallies.ts";

const OPTIONS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

const RESPONDENTS = [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }];

function answer(userId: string, fields: Partial<TallyAnswer> = {}): TallyAnswer {
  return { userId, choices: [], otherText: null, ...fields };
}

const pick = (...optionIds: string[]) => optionIds.map((optionId) => ({ optionId, rank: null }));

const ranks = (...pairs: [string, number | null][]) =>
  pairs.map(([optionId, rank]) => ({ optionId, rank }));

describe("choiceTallies", () => {
  const question: TallyQuestion = { allowOther: false, options: OPTIONS };

  it("counts each option in option order against the respondents", () => {
    const tallies = choiceTallies(question, RESPONDENTS, [
      answer("u1", { choices: pick("b") }),
      answer("u2", { choices: pick("a") }),
      answer("u3", { choices: pick("b") }),
    ]);
    assert.deepEqual(tallies.rows, [
      { label: "Alpha", count: 1 },
      { label: "Beta", count: 2 },
    ]);
    assert.equal(tallies.total, 3);
    assert.equal(tallies.notAnswered, 0);
  });

  it("never counts an answer from someone who is not a respondent", () => {
    const tallies = choiceTallies({ ...question, allowOther: true }, RESPONDENTS, [
      answer("u1", { choices: pick("a") }),
      answer("outsider", { choices: pick("a", "b"), otherText: "mine" }),
    ]);
    assert.deepEqual(tallies.rows, [
      { label: "Alpha", count: 1 },
      { label: "Beta", count: 0 },
      { label: "Other", count: 0 },
    ]);
    assert.deepEqual(tallies.otherTexts, []);
    assert.equal(tallies.notAnswered, 2);
  });

  it("an answer with only an Other text counts as answered", () => {
    const tallies = choiceTallies({ ...question, allowOther: true }, RESPONDENTS, [
      answer("u1", { otherText: "a one-shot" }),
    ]);
    assert.deepEqual(tallies.rows.at(-1), { label: "Other", count: 1 });
    assert.deepEqual(tallies.otherTexts, ["a one-shot"]);
    assert.equal(tallies.notAnswered, 2);
  });

  it("shows Other with a count of 0 when Other is allowed and nobody wrote one", () => {
    const tallies = choiceTallies({ ...question, allowOther: true }, RESPONDENTS, []);
    assert.deepEqual(tallies.rows.at(-1), { label: "Other", count: 0 });
    assert.deepEqual(tallies.otherTexts, []);
  });

  it("leaves Other out when it is not allowed and nobody wrote one", () => {
    const tallies = choiceTallies(question, RESPONDENTS, [answer("u1", { choices: pick("a") })]);
    assert.deepEqual(
      tallies.rows.map((row) => row.label),
      ["Alpha", "Beta"],
    );
  });

  it("keeps Other when it is not allowed but an old Other text exists", () => {
    const tallies = choiceTallies(question, RESPONDENTS, [
      answer("u1", { otherText: "old" }),
      answer("u2", { choices: pick("a"), otherText: "older" }),
    ]);
    assert.deepEqual(tallies.rows.at(-1), { label: "Other", count: 2 });
    assert.deepEqual(tallies.otherTexts, ["old", "older"]);
  });

  it("multiple-choice counts can add up to more than the total", () => {
    const tallies = choiceTallies(question, RESPONDENTS, [
      answer("u1", { choices: pick("a", "b") }),
      answer("u2", { choices: pick("a", "b") }),
    ]);
    const sum = tallies.rows.reduce((total, row) => total + row.count, 0);
    assert.equal(sum, 4);
    assert.ok(sum > tallies.total);
  });

  it("not answered is the respondents without a choice or an Other text", () => {
    const tallies = choiceTallies({ ...question, allowOther: true }, RESPONDENTS, [
      answer("u1", { choices: pick("a") }),
      answer("u2", { otherText: "" }),
    ]);
    assert.equal(tallies.notAnswered, 2);
  });
});

describe("rankingTallies", () => {
  const question: TallyQuestion = { allowOther: false, options: OPTIONS };

  it("counts first choices, rankings and the average place per option", () => {
    const tallies = rankingTallies(question, RESPONDENTS, [
      answer("u1", { choices: ranks(["a", 1], ["b", 2]) }),
      answer("u2", { choices: ranks(["a", 2], ["b", 1]) }),
      answer("u3", { choices: ranks(["a", 1], ["b", null]) }),
    ]);
    assert.deepEqual(tallies.rows, [
      { label: "Alpha", firstCount: 2, rankedCount: 3, averagePlace: 4 / 3 },
      { label: "Beta", firstCount: 1, rankedCount: 2, averagePlace: 1.5 },
    ]);
    assert.equal(tallies.total, 3);
    assert.equal(tallies.notRanked, 0);
  });

  it("the first choice is the lowest rank even when ranks don't start at 1", () => {
    const tallies = rankingTallies(question, RESPONDENTS, [
      answer("u1", { choices: ranks(["a", 5], ["b", 3]) }),
    ]);
    assert.deepEqual(
      tallies.rows.map((row) => row.firstCount),
      [0, 1],
    );
  });

  it("averagePlace is null when nobody ranked an option", () => {
    const tallies = rankingTallies(question, RESPONDENTS, [
      answer("u1", { choices: ranks(["a", 1], ["b", null]) }),
    ]);
    assert.equal(tallies.rows[1].rankedCount, 0);
    assert.equal(tallies.rows[1].averagePlace, null);
  });

  it("never counts an answer from someone who is not a respondent", () => {
    const tallies = rankingTallies(question, RESPONDENTS, [
      answer("outsider", { choices: ranks(["a", 1], ["b", 2]) }),
    ]);
    assert.deepEqual(
      tallies.rows.map((row) => [row.firstCount, row.rankedCount]),
      [
        [0, 0],
        [0, 0],
      ],
    );
    assert.equal(tallies.notRanked, 3);
  });

  it("not ranked is the respondents without a non-null rank", () => {
    const tallies = rankingTallies(question, RESPONDENTS, [
      answer("u1", { choices: ranks(["a", 1]) }),
      answer("u2", { choices: ranks(["a", null], ["b", null]) }),
    ]);
    assert.equal(tallies.notRanked, 2);
  });
});
