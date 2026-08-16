import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function safeJSONParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

/**
 * Extract the first balanced JSON object from a string.
 * Handles cases where the model adds prose around the JSON.
 */
export function extractFirstJSONObject<T>(input: string): T | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Direct parse first.
  const direct = safeJSONParse<T>(trimmed);
  if (direct) return direct;
  // Strip code fences.
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const fromFence = safeJSONParse<T>(fenced);
  if (fromFence) return fromFence;
  // Scan for the first balanced object.
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < fenced.length; i++) {
    const ch = fenced[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = fenced.slice(start, i + 1);
        const parsed = safeJSONParse<T>(candidate);
        if (parsed) return parsed;
        start = -1;
      }
    }
  }
  return null;
}

export function highlightWord(sentence: string, word: string): string {
  if (!word) return sentence;
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(`(${safe})`, "gi"), "«$1»");
}