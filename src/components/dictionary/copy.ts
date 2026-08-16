import type { TargetLanguage } from "@/shared/types";

export interface PopupCopy {
  dictionaryTab: string;
  translationTab: string;
  aiTab: string;
  tabListLabel: string;
  dialogLabel: (word: string) => string;
  selectionTriggerLabel: string;
  selectionTriggerTooltip: string;
  audioUk: string;
  audioUs: string;
  copyWord: string;
  copied: string;
  copyFailed: string;
  askAI: string;
  askAILoading: string;
  askAITooltip: string;
  close: string;
  closeTooltip: string;
  meaning: string;
  relatedPhrases: string;
  synonyms: string;
  fallback: string;
  translating: string;
  partial: string;
  aiThinking: string;
  thinking: string;
  generatingResponse: string;
  retry: string;
  originalText: string;
  translatedText: string;
  browserTranslationBadge: string;
  translationPreparing: string;
  translatorUnavailable: string;
  translationFailed: string;
  copyOriginal: string;
  copyTranslation: string;
  aiNoResponse: string;
  noDictionaryResult: string;
  askAIForResult: string;
  configureAI: string;
  lookupFailed: string;
  audioFailed: string;
  errorMessage: (code: string) => string;
}

const ERROR_COPY: Record<TargetLanguage, Record<string, string>> = {
  en: {
    OFFLINE: "No network connection. Check your Internet connection.",
    TIMEOUT: "The request took too long. Please try again.",
    INVALID_API_KEY: "The OpenRouter API key is invalid. Check Settings.",
    MISSING_API_KEY: "No OpenRouter API key is configured. Open Settings to add one.",
    RATE_LIMITED: "The request limit was reached. Please try again later.",
    UNKNOWN_MODEL: "The OpenRouter model is unavailable.",
    BAD_RESPONSE: "The server returned an invalid response.",
    EMPTY_RESPONSE: "The AI returned an empty response. Please try again.",
    NO_RESULT: "No dictionary result was found.",
    INTERNAL: "Something went wrong. Please try again.",
  },
  vi: {
    OFFLINE: "Không có kết nối mạng. Vui lòng kiểm tra Internet.",
    TIMEOUT: "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.",
    INVALID_API_KEY: "API key OpenRouter không hợp lệ. Vui lòng kiểm tra trong Cài đặt.",
    MISSING_API_KEY: "Chưa cấu hình API key OpenRouter. Mở Cài đặt để nhập.",
    RATE_LIMITED: "Đã vượt giới hạn yêu cầu. Vui lòng thử lại sau ít phút.",
    UNKNOWN_MODEL: "Model OpenRouter không tồn tại hoặc không khả dụng.",
    BAD_RESPONSE: "Phản hồi từ máy chủ không hợp lệ.",
    EMPTY_RESPONSE: "AI trả về phản hồi trống. Vui lòng thử lại.",
    NO_RESULT: "Không tìm thấy kết quả tra từ.",
    INTERNAL: "Đã xảy ra lỗi. Vui lòng thử lại.",
  },
  "zh-CN": {
    OFFLINE: "没有网络连接，请检查网络。",
    TIMEOUT: "请求耗时过长，请重试。",
    INVALID_API_KEY: "OpenRouter API 密钥无效，请检查设置。",
    MISSING_API_KEY: "尚未配置 OpenRouter API 密钥，请打开设置添加。",
    RATE_LIMITED: "请求次数已达限制，请稍后再试。",
    UNKNOWN_MODEL: "OpenRouter 模型不可用。",
    BAD_RESPONSE: "服务器返回了无效响应。",
    EMPTY_RESPONSE: "AI 返回了空响应，请重试。",
    NO_RESULT: "未找到词典结果。",
    INTERNAL: "发生错误，请重试。",
  },
};

function errorMessage(language: TargetLanguage, code: string): string {
  return ERROR_COPY[language]?.[code] ?? ERROR_COPY[language]?.INTERNAL ?? ERROR_COPY.en.INTERNAL;
}

const COPY: Record<TargetLanguage, PopupCopy> = {
  en: {
    dictionaryTab: "Dictionary",
    translationTab: "Translation",
    aiTab: "OpenRouter",
    tabListLabel: "Explanation source",
    dialogLabel: (word) => `Dictionary lookup for ${word}`,
    selectionTriggerLabel: "Open dictionary for selected text",
    selectionTriggerTooltip: "Open dictionary",
    audioUk: "Pronounce UK",
    audioUs: "Pronounce US",
    copyWord: "Copy word",
    copied: "Copied",
    copyFailed: "Unable to copy",
    askAI: "Ask AI",
    askAILoading: "Asking…",
    askAITooltip: "Explain deeply with AI",
    close: "Close",
    closeTooltip: "Close",
    meaning: "Meaning: ",
    relatedPhrases: "Related phrases",
    synonyms: "Synonyms",
    fallback: "Translation is unavailable; showing the English source.",
    translating: "Translating with your browser…",
    partial: "Showing dictionary definitions with FreeDictionaryAPI equivalents.",
    aiThinking: "AI is thinking…",
    thinking: "Thinking",
    generatingResponse: "Generating response…",
    retry: "Try again",
    originalText: "Original text",
    translatedText: "Translation",
    browserTranslationBadge: "Browser translation",
    translationPreparing: "Preparing translation…",
    translatorUnavailable: "Browser translation is unavailable for this language pair.",
    translationFailed: "Translation failed. Please try again.",
    copyOriginal: "Copy original",
    copyTranslation: "Copy translation",
    aiNoResponse: "AI has not responded.",
    noDictionaryResult: "No dictionary result was found for this item.",
    askAIForResult: "Ask AI for a result",
    configureAI: "Configure AI to search",
    lookupFailed: "Unable to look up",
    audioFailed: "Unable to play audio",
    errorMessage: (code) => errorMessage("en", code),
  },
  vi: {
    dictionaryTab: "Từ điển",
    translationTab: "Bản dịch",
    aiTab: "OpenRouter",
    tabListLabel: "Nguồn giải thích",
    dialogLabel: (word) => `Tra từ ${word}`,
    selectionTriggerLabel: "Mở từ điển cho nội dung đã chọn",
    selectionTriggerTooltip: "Mở từ điển",
    audioUk: "Phát âm UK",
    audioUs: "Phát âm US",
    copyWord: "Sao chép từ",
    copied: "Đã sao chép",
    copyFailed: "Không thể sao chép",
    askAI: "Hỏi AI",
    askAILoading: "Đang hỏi…",
    askAITooltip: "Giải thích sâu bằng AI",
    close: "Đóng",
    closeTooltip: "Đóng",
    meaning: "Nghĩa: ",
    relatedPhrases: "Cụm từ liên quan",
    synonyms: "Từ đồng nghĩa",
    fallback: "Không thể dịch theo ngôn ngữ đã chọn, đang hiển thị bản tiếng Anh.",
    translating: "Đang dịch bằng trình duyệt…",
    partial: "Đang hiển thị định nghĩa gốc và tương đương từ FreeDictionaryAPI.",
    aiThinking: "AI đang suy nghĩ…",
    thinking: "Suy luận",
    generatingResponse: "Đang tạo câu trả lời…",
    retry: "Thử lại",
    originalText: "Văn bản gốc",
    translatedText: "Bản dịch",
    browserTranslationBadge: "Dịch bằng trình duyệt",
    translationPreparing: "Đang chuẩn bị bản dịch…",
    translatorUnavailable: "Trình duyệt chưa hỗ trợ dịch cặp ngôn ngữ này.",
    translationFailed: "Dịch thất bại. Vui lòng thử lại.",
    copyOriginal: "Sao chép văn bản gốc",
    copyTranslation: "Sao chép bản dịch",
    aiNoResponse: "AI chưa phản hồi.",
    noDictionaryResult: "Chưa có kết quả tra từ cho mục này.",
    askAIForResult: "Hỏi AI để có kết quả",
    configureAI: "Cấu hình AI để tra cứu",
    lookupFailed: "Không thể tra từ",
    audioFailed: "Không thể phát âm thanh",
    errorMessage: (code) => errorMessage("vi", code),
  },
  "zh-CN": {
    dictionaryTab: "词典",
    translationTab: "翻译",
    aiTab: "OpenRouter",
    tabListLabel: "解释来源",
    dialogLabel: (word) => `查询 ${word}`,
    selectionTriggerLabel: "打开所选内容的词典",
    selectionTriggerTooltip: "打开词典",
    audioUk: "播放英式发音",
    audioUs: "播放美式发音",
    copyWord: "复制单词",
    copied: "已复制",
    copyFailed: "无法复制",
    askAI: "询问 AI",
    askAILoading: "正在询问…",
    askAITooltip: "使用 AI 深入解释",
    close: "关闭",
    closeTooltip: "关闭",
    meaning: "释义：",
    relatedPhrases: "相关短语",
    synonyms: "同义词",
    fallback: "翻译不可用，当前显示英文原文。",
    translating: "正在使用浏览器翻译…",
    partial: "正在显示词典原文，并附上 FreeDictionaryAPI 的对应词。",
    aiThinking: "AI 正在思考…",
    thinking: "思考过程",
    generatingResponse: "正在生成回答…",
    retry: "重试",
    originalText: "原文",
    translatedText: "译文",
    browserTranslationBadge: "浏览器翻译",
    translationPreparing: "正在准备翻译…",
    translatorUnavailable: "浏览器暂不支持这个语言组合。",
    translationFailed: "翻译失败，请重试。",
    copyOriginal: "复制原文",
    copyTranslation: "复制译文",
    aiNoResponse: "AI 尚未返回结果。",
    noDictionaryResult: "未找到该词的词典结果。",
    askAIForResult: "询问 AI 获取结果",
    configureAI: "配置 AI 后查询",
    lookupFailed: "无法查询单词",
    audioFailed: "无法播放音频",
    errorMessage: (code) => errorMessage("zh-CN", code),
  },
};

export function getPopupCopy(language: TargetLanguage): PopupCopy {
  return COPY[language] ?? COPY.en;
}
