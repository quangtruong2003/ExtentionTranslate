export function shouldShowThinking(enabled: boolean, text: string): boolean {
  return enabled && text.trim().length > 0;
}

export function getThinkingProgressTitle(text: string): string | null {
  let latestTitle: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\*\*(.*?)\*\*$/, "$1")
      .replace(/^__(.*?)__$/, "$1");
    const match = /^\d+\.\s+(.+?)(?::\s*)?$/.exec(line);
    if (!match) continue;
    const title = match[1]
      .replace(/(?:[:：]\s*)?(?:\.{3}|…)+\s*$/u, "")
      .replace(/[:：]\s*$/u, "")
      .replace(/\*\*/g, "")
      .replace(/__/g, "")
      .replace(/[`*_]/g, "")
      .trim();
    if (title) latestTitle = title;
  }
  return latestTitle;
}

export function shouldAutoCollapseThinking(previousAnswer: string, nextAnswer: string, loading: boolean): boolean {
  if (!loading) return true;
  if (!nextAnswer) return true;
  return previousAnswer.length === 0;
}
