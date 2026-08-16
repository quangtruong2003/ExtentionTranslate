export function shouldShowThinking(enabled: boolean, text: string): boolean {
  return enabled && text.trim().length > 0;
}

export function shouldAutoCollapseThinking(previousAnswer: string, nextAnswer: string, loading: boolean): boolean {
  if (!loading) return true;
  if (!nextAnswer) return true;
  return previousAnswer.length === 0;
}
