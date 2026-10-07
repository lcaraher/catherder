// Unanswered questions; once the Questions tab has been seen, only the required ones.
export function questionsLeft(
  questions: { required: boolean; answered: boolean }[],
  seen: boolean,
): number {
  return questions.filter((q) => !q.answered && (!seen || q.required)).length;
}
