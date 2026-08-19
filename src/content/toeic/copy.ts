import type { TargetLanguage } from "@/shared/types";

export interface QuizCopy {
  next: string;
  seeResults: string;
  resultTitle: (score: number, total: number) => string;
  question: (n: number) => string;
  youChose: string;
  correctAnswer: string;
  noAnswer: string;
  close: string;
  scrollHint: string;
  end: string;
}

const COPY: Record<TargetLanguage, QuizCopy> = {
  en: {
    next: "Next question",
    seeResults: "See results",
    resultTitle: (score, total) => `Results: ${score}/${total} correct`,
    question: (n) => `Question ${n}`,
    youChose: "You chose",
    correctAnswer: "Correct answer",
    noAnswer: "No answer",
    close: "Close",
    scrollHint: "Scroll down to read all explanations…",
    end: "— End —",
  },
  vi: {
    next: "Câu tiếp theo",
    seeResults: "Xem kết quả",
    resultTitle: (score, total) => `Kết quả: ${score}/${total} câu đúng`,
    question: (n) => `Câu ${n}`,
    youChose: "Bạn chọn",
    correctAnswer: "Đáp án đúng",
    noAnswer: "Không trả lời",
    close: "Đóng",
    scrollHint: "Cuộn xuống để đọc hết giải thích…",
    end: "— Hết —",
  },
  "zh-CN": {
    next: "下一题",
    seeResults: "查看结果",
    resultTitle: (score, total) => `结果：${score}/${total} 题正确`,
    question: (n) => `第 ${n} 题`,
    youChose: "你选择了",
    correctAnswer: "正确答案",
    noAnswer: "未作答",
    close: "关闭",
    scrollHint: "向下滚动阅读所有解释…",
    end: "— 完 —",
  },
};

export function getQuizCopy(language: TargetLanguage): QuizCopy {
  return COPY[language] ?? COPY.en;
}
