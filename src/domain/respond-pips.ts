// Unanswered questions (only required ones once the tab is seen), plus marked ones until opened.
export function questionsLeft(
  questions: { required: boolean; answered: boolean; marked?: boolean }[],
  seen: boolean,
  opened: boolean = seen,
): number {
  return questions.filter(
    (q) => (!q.answered && (q.required || !seen)) || (q.marked && !opened),
  ).length;
}
