// The mark beside a question on the respond page: an older answer, or none since submitting.
export function questionMark(
  question: { version: number },
  answer: { questionVersion: number } | null,
  submitted: boolean,
): "changed" | "new" | null {
  if (answer) return answer.questionVersion < question.version ? "changed" : null;
  return submitted ? "new" : null;
}

// Questions the organizer asked this viewer to check or answer and they have not yet.
export function questionNotices({
  submitted,
  questions,
  answers,
}: {
  submitted: boolean;
  questions: { id: string; checkRequestedVersion: number | null }[];
  answers: { questionId: string; questionVersion: number }[];
}): { changed: number; added: number } {
  const versions = new Map(answers.map((answer) => [answer.questionId, answer.questionVersion]));
  let changed = 0;
  let added = 0;
  for (const question of questions) {
    if (question.checkRequestedVersion === null) continue;
    const version = versions.get(question.id);
    if (version === undefined) {
      if (submitted) added += 1;
    } else if (version < question.checkRequestedVersion) {
      changed += 1;
    }
  }
  return { changed, added };
}

// The home card chip's words.
export function noticeLabel(kind: "changed" | "added", count: number): string {
  if (kind === "changed") return count === 1 ? "Question has changed" : "Questions have changed";
  return count === 1 ? "New Question added" : "New Questions added";
}

// The organizer's ask box's words.
export function askLabel(kind: "check" | "answer", count: number): string {
  const who = count === 1 ? "the 1 person" : `the ${count} people`;
  return kind === "check"
    ? `Ask ${who} who answered to check their answer`
    : `Ask ${who} who already responded to answer it`;
}
