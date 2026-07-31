export const PROTEIN_SELECTION_LIMIT = 25;

export function changeOptionQuantity(choices: string[], optionId: string, change: 1 | -1,
                                     maximum = PROTEIN_SELECTION_LIMIT): string[] {
  if (change === 1) return choices.length >= maximum ? choices : [...choices, optionId];
  const index = choices.lastIndexOf(optionId);
  if (index < 0) return choices;
  return [...choices.slice(0, index), ...choices.slice(index + 1)];
}
