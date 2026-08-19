import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToeicQuizPayload } from "@/services/toeic/types";
import type { TargetLanguage } from "@/shared/types";
import { QuizOverlay } from "./QuizOverlay";
import popupCss from "@/styles/popup.css?inline";

const QUIZ_HOST_ID = "extention-translate-toeic-quiz";

let quizRoot: Root | null = null;
let quizHost: HTMLElement | null = null;

export function isToeicQuizVisible(): boolean {
  return quizHost !== null;
}

export function showToeicQuiz(
  payload: ToeicQuizPayload,
  targetLanguage: TargetLanguage,
  onDone: () => void,
): void {
  if (quizHost) return;
  quizHost = document.createElement("div");
  quizHost.id = QUIZ_HOST_ID;
  Object.assign(quizHost.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "auto",
  });
  document.documentElement.appendChild(quizHost);

  const shadow = quizHost.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = popupCss as unknown as string;
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  shadow.appendChild(container);

  quizRoot = createRoot(container);
  quizRoot.render(createElement(QuizOverlay, { payload, targetLanguage, onDone }));
}

export function hideToeicQuiz(): void {
  quizRoot?.unmount();
  quizRoot = null;
  quizHost?.remove();
  quizHost = null;
}
