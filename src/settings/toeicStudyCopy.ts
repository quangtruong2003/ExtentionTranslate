import type { TargetLanguage } from "@/shared/types";

export interface ToeicStudyCopy {
  heading: string;
  intro: string;

  // Word of the day
  wordOfDayTitle: string;
  wordOfDayDescription: string;
  wordOfDaySpeak: string;
  wordOfDayExampleLabel: string;

  // Flashcards
  flashcardsTitle: string;
  flashcardsDescription: string;
  flashcardsStart: string;
  flashcardsRestart: string;
  flashcardsFlipHint: string;
  flashcardsGotIt: string;
  flashcardsMissed: string;
  flashcardsProgress: (current: number, total: number) => string;
  flashcardsDoneTitle: string;
  flashcardsDoneSummary: (correct: number, total: number) => string;
  flashcardsEmpty: string;

  // Listening quiz
  listeningTitle: string;
  listeningDescription: string;
  listeningStart: string;
  listeningRestart: string;
  listeningPlay: string;
  listeningPlayAgain: string;
  listeningCorrect: string;
  listeningWrong: string;
  listeningNext: string;
  listeningProgress: (current: number, total: number) => string;
  listeningDoneTitle: string;
  listeningDoneSummary: (correct: number, total: number) => string;
  listeningEmpty: string;
  listeningUnavailable: string;

  // Stats
  statsTitle: string;
  statsDescription: string;
  statsCurrentStreak: string;
  statsBestStreak: string;
  statsTotalAnswered: string;
  statsAccuracy: string;
  statsDaySuffix: string;
  statsRecentTitle: string;
  statsEmpty: string;
  statsClear: string;
  statsClearedToast: string;
  statsPart5: string;
  statsListening: string;
  statsFlashcards: string;
  statsNoData: string;
}

const COPY: Record<TargetLanguage, ToeicStudyCopy> = {
  en: {
    heading: "TOEIC Study",
    intro: "Practice TOEIC vocabulary and listening right inside the extension, and track your daily study streak.",
    wordOfDayTitle: "Word of the day",
    wordOfDayDescription: "A new high-frequency TOEIC word every day.",
    wordOfDaySpeak: "Pronounce",
    wordOfDayExampleLabel: "Example",
    flashcardsTitle: "Vocabulary flashcards",
    flashcardsDescription: "Review your saved words as flip cards and grade yourself.",
    flashcardsStart: "Start review",
    flashcardsRestart: "Review again",
    flashcardsFlipHint: "Click the card to flip it",
    flashcardsGotIt: "I knew it",
    flashcardsMissed: "I missed it",
    flashcardsProgress: (current, total) => `${current}/${total}`,
    flashcardsDoneTitle: "Review complete",
    flashcardsDoneSummary: (correct, total) => `You remembered ${correct} of ${total} words.`,
    flashcardsEmpty: "No saved words yet. Look up and star words on the web to build your deck.",
    listeningTitle: "Listening quiz",
    listeningDescription: "Listen to a word from your vocabulary and pick the one you heard.",
    listeningStart: "Start listening quiz",
    listeningRestart: "Play again",
    listeningPlay: "Play word",
    listeningPlayAgain: "Play again",
    listeningCorrect: "Correct!",
    listeningWrong: "Not quite",
    listeningNext: "Next",
    listeningProgress: (current, total) => `${current}/${total}`,
    listeningDoneTitle: "Quiz complete",
    listeningDoneSummary: (correct, total) => `You got ${correct} of ${total} right.`,
    listeningEmpty: "You need at least one saved word to start a listening quiz.",
    listeningUnavailable: "Speech synthesis is unavailable in this browser.",
    statsTitle: "Study stats & streak",
    statsDescription: "Your quiz results are saved on this device to track your progress.",
    statsCurrentStreak: "Current streak",
    statsBestStreak: "Best streak",
    statsTotalAnswered: "Questions answered",
    statsAccuracy: "Accuracy",
    statsDaySuffix: "days",
    statsRecentTitle: "Last 7 days",
    statsEmpty: "No study activity yet. Finish a quiz or a flashcard review to start your streak.",
    statsClear: "Reset stats",
    statsClearedToast: "Study stats cleared",
    statsPart5: "Part 5 quiz",
    statsListening: "Listening",
    statsFlashcards: "Flashcards",
    statsNoData: "No activity",
  },
  vi: {
    heading: "Học TOEIC",
    intro: "Luyện từ vựng và nghe TOEIC ngay trong tiện ích, đồng thời theo dõi chuỗi ngày học của bạn.",
    wordOfDayTitle: "Từ vựng mỗi ngày",
    wordOfDayDescription: "Mỗi ngày một từ TOEIC tần suất cao.",
    wordOfDaySpeak: "Phát âm",
    wordOfDayExampleLabel: "Ví dụ",
    flashcardsTitle: "Flashcard từ vựng",
    flashcardsDescription: "Ôn tập các từ đã lưu dưới dạng thẻ lật và tự đánh giá.",
    flashcardsStart: "Bắt đầu ôn tập",
    flashcardsRestart: "Ôn lại lần nữa",
    flashcardsFlipHint: "Bấm vào thẻ để lật",
    flashcardsGotIt: "Tôi nhớ",
    flashcardsMissed: "Tôi quên",
    flashcardsProgress: (current, total) => `${current}/${total}`,
    flashcardsDoneTitle: "Hoàn thành ôn tập",
    flashcardsDoneSummary: (correct, total) => `Bạn nhớ được ${correct}/${total} từ.`,
    flashcardsEmpty: "Chưa có từ nào được lưu. Tra từ và bấm ngôi sao trên web để tạo bộ thẻ.",
    listeningTitle: "Quiz nghe",
    listeningDescription: "Nghe một từ trong sổ từ vựng và chọn từ bạn nghe được.",
    listeningStart: "Bắt đầu quiz nghe",
    listeningRestart: "Làm lại",
    listeningPlay: "Phát từ",
    listeningPlayAgain: "Phát lại",
    listeningCorrect: "Chính xác!",
    listeningWrong: "Chưa đúng",
    listeningNext: "Tiếp theo",
    listeningProgress: (current, total) => `${current}/${total}`,
    listeningDoneTitle: "Hoàn thành quiz",
    listeningDoneSummary: (correct, total) => `Bạn đúng ${correct}/${total} câu.`,
    listeningEmpty: "Bạn cần ít nhất một từ đã lưu để bắt đầu quiz nghe.",
    listeningUnavailable: "Trình tổng hợp giọng nói không khả dụng trên trình duyệt này.",
    statsTitle: "Thống kê & chuỗi ngày học",
    statsDescription: "Kết quả quiz được lưu trên thiết bị để theo dõi tiến độ của bạn.",
    statsCurrentStreak: "Chuỗi hiện tại",
    statsBestStreak: "Chuỗi kỷ lục",
    statsTotalAnswered: "Số câu đã làm",
    statsAccuracy: "Tỷ lệ đúng",
    statsDaySuffix: "ngày",
    statsRecentTitle: "7 ngày gần nhất",
    statsEmpty: "Chưa có hoạt động học. Hoàn thành một quiz hoặc lượt ôn flashcard để bắt đầu chuỗi ngày học.",
    statsClear: "Đặt lại thống kê",
    statsClearedToast: "Đã xóa thống kê học tập",
    statsPart5: "Quiz Part 5",
    statsListening: "Nghe",
    statsFlashcards: "Flashcard",
    statsNoData: "Chưa hoạt động",
  },
  "zh-CN": {
    heading: "TOEIC 学习",
    intro: "直接在扩展中练习 TOEIC 词汇和听力，并跟踪你的每日学习连续天数。",
    wordOfDayTitle: "每日单词",
    wordOfDayDescription: "每天一个高频 TOEIC 单词。",
    wordOfDaySpeak: "发音",
    wordOfDayExampleLabel: "例句",
    flashcardsTitle: "词汇闪卡",
    flashcardsDescription: "以翻卡形式复习已保存的单词并自我评分。",
    flashcardsStart: "开始复习",
    flashcardsRestart: "再复习一次",
    flashcardsFlipHint: "点击卡片翻转",
    flashcardsGotIt: "我记住了",
    flashcardsMissed: "我忘了",
    flashcardsProgress: (current, total) => `${current}/${total}`,
    flashcardsDoneTitle: "复习完成",
    flashcardsDoneSummary: (correct, total) => `你记住了 ${correct}/${total} 个单词。`,
    flashcardsEmpty: "还没有保存的单词。在网页上查词并加星即可生成卡组。",
    listeningTitle: "听力测验",
    listeningDescription: "听一个词汇本中的单词，选出你听到的词。",
    listeningStart: "开始听力测验",
    listeningRestart: "再来一次",
    listeningPlay: "播放单词",
    listeningPlayAgain: "重新播放",
    listeningCorrect: "正确！",
    listeningWrong: "不对",
    listeningNext: "下一题",
    listeningProgress: (current, total) => `${current}/${total}`,
    listeningDoneTitle: "测验完成",
    listeningDoneSummary: (correct, total) => `你答对了 ${correct}/${total} 题。`,
    listeningEmpty: "至少需要一个已保存的单词才能开始听力测验。",
    listeningUnavailable: "此浏览器不支持语音合成。",
    statsTitle: "学习统计与连续天数",
    statsDescription: "测验结果保存在本设备上，用于跟踪你的进度。",
    statsCurrentStreak: "当前连续天数",
    statsBestStreak: "最佳连续天数",
    statsTotalAnswered: "已答题数",
    statsAccuracy: "正确率",
    statsDaySuffix: "天",
    statsRecentTitle: "最近 7 天",
    statsEmpty: "还没有学习活动。完成一次测验或闪卡复习即可开始连续打卡。",
    statsClear: "重置统计",
    statsClearedToast: "已清空学习统计",
    statsPart5: "Part 5 测验",
    statsListening: "听力",
    statsFlashcards: "闪卡",
    statsNoData: "无活动",
  },
};

export function getToeicStudyCopy(language: TargetLanguage): ToeicStudyCopy {
  return COPY[language] ?? COPY.en;
}
