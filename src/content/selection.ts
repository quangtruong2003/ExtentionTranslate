import { MAX_SELECTION_LENGTH } from "@/shared/constants";

export interface SelectionInfo {
  text: string;
  rect: DOMRect;
  range: Range;
  sentence?: string;
  contextBefore?: string;
  contextAfter?: string;
  pageLanguage?: string;
}

function isInsideExtension(el: EventTarget | null): boolean {
  if (!(el instanceof Node)) return false;
  const host = document.getElementById("extention-translate-host");
  return Boolean(host && (host === el || host.contains(el)));
}

export function getCurrentSelection(target?: EventTarget | null): SelectionInfo | null {
  if (isInsideExtension(target ?? null)) return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  if (selection.isCollapsed) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  if (text.length > MAX_SELECTION_LENGTH) return null;
  // Whitespace-only selection
  if (!/\S/.test(text)) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;

  const sentence = extractSentence(range);
  const { before, after } = extractContext(range, 120);

  let pageLanguage: string | undefined;
  const root = (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? (range.commonAncestorContainer as Element)
    : (range.commonAncestorContainer.parentElement as Element | null));
  if (root?.closest("[lang]")) {
    const langEl = root.closest<HTMLElement>("[lang]");
    pageLanguage = langEl?.getAttribute("lang") ?? undefined;
  } else {
    pageLanguage = document.documentElement.getAttribute("lang") ?? undefined;
  }

  return {
    text,
    rect,
    range: range.cloneRange(),
    sentence,
    contextBefore: before,
    contextAfter: after,
    pageLanguage,
  };
}

function extractSentence(range: Range): string | undefined {
  const container = range.commonAncestorContainer;
  const blockEl = (container.nodeType === Node.ELEMENT_NODE
    ? (container as Element)
    : (container.parentElement as Element | null));
  if (!blockEl) return undefined;
  const block = blockEl.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, td, div, section, article");
  const textSource = (block?.textContent ?? container.textContent ?? "").trim();
  if (!textSource) return undefined;

  // Try to find a sentence around the selected text using heuristic boundary characters.
  const selected = range.toString().trim();
  if (!selected) return undefined;
  const idx = textSource.indexOf(selected);
  if (idx === -1) return textSource.slice(0, 400);

  const before = textSource.slice(0, idx);
  const after = textSource.slice(idx + selected.length);
  const lastBoundary = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
    before.lastIndexOf("\n"),
  );
  const start = lastBoundary >= 0 ? lastBoundary + 2 : 0;
  const nextBoundary = (() => {
    for (let i = 0; i < after.length; i++) {
      const ch = after[i];
      if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
        return i + 1;
      }
    }
    return after.length;
  })();
  const sentence = (before.slice(start) + selected + after.slice(0, nextBoundary)).trim();
  return sentence || undefined;
}

function extractContext(range: Range, window: number): { before: string; after: string } {
  const container = range.commonAncestorContainer;
  const parentEl =
    container.nodeType === Node.ELEMENT_NODE
      ? (container as Element)
      : (container.parentElement as Element | null);
  const source = parentEl?.textContent ?? "";
  if (!source) return { before: "", after: "" };

  // Use the first range point's character index in the textContent.
  let offset = 0;
  if (parentEl && container.nodeType === Node.TEXT_NODE) {
    const walker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT);
    let found = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node === container) {
        offset += range.startOffset + found;
        break;
      }
      found += node.nodeValue?.length ?? 0;
    }
  }
  const before = source.slice(Math.max(0, offset - window), offset).trim();
  const after = source
    .slice(offset + range.toString().length, offset + range.toString().length + window)
    .trim();
  return { before, after };
}
