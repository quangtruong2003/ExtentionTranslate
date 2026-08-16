export class ExtensionError extends Error {
  code: string;
  userMessage: string;
  retryable: boolean;

  constructor(code: string, userMessage: string, retryable = true, cause?: unknown) {
    super(userMessage);
    this.name = "ExtensionError";
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = retryable;
    if (cause !== undefined) {
      // Standard Error cause (ES2022)
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export const ERROR_CODES = {
  OFFLINE: "OFFLINE",
  TIMEOUT: "TIMEOUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_API_KEY: "INVALID_API_KEY",
  RATE_LIMITED: "RATE_LIMITED",
  UNKNOWN_MODEL: "UNKNOWN_MODEL",
  BAD_RESPONSE: "BAD_RESPONSE",
  EMPTY_RESPONSE: "EMPTY_RESPONSE",
  NO_RESULT: "NO_RESULT",
  INTERNAL: "INTERNAL",
  MISSING_API_KEY: "MISSING_API_KEY",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function mapOpenRouterErrorCode(providerCode: unknown, message: string): ErrorCode {
  const details = `${typeof providerCode === "string" || typeof providerCode === "number" ? providerCode : ""} ${message}`.toLowerCase();
  if (/api.?key|unauthoriz|authentication|\b401\b|\b403\b/.test(details)) return ERROR_CODES.INVALID_API_KEY;
  if (/rate|limit|quota|too many requests|\b429\b/.test(details)) return ERROR_CODES.RATE_LIMITED;
  if (/timeout|timed out|deadline|gateway timeout|\b408\b|\b504\b/.test(details)) return ERROR_CODES.TIMEOUT;
  if (/model|no endpoints|\b404\b/.test(details)) return ERROR_CODES.UNKNOWN_MODEL;
  return ERROR_CODES.BAD_RESPONSE;
}

export function createOpenRouterStreamError(providerCode: unknown, message: string): ExtensionError {
  const code = mapOpenRouterErrorCode(providerCode, message);
  const retryable = code !== ERROR_CODES.INVALID_API_KEY && code !== ERROR_CODES.UNKNOWN_MODEL;
  return new ExtensionError(code, message, retryable);
}

export function userMessageFor(code: string): string {
  switch (code) {
    case ERROR_CODES.OFFLINE:
      return "Không có kết nối mạng. Vui lòng kiểm tra Internet.";
    case ERROR_CODES.TIMEOUT:
      return "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.";
    case ERROR_CODES.UNAUTHORIZED:
    case ERROR_CODES.INVALID_API_KEY:
      return "API key OpenRouter không hợp lệ. Vui lòng kiểm tra trong Cài đặt.";
    case ERROR_CODES.MISSING_API_KEY:
      return "Chưa cấu hình API key OpenRouter. Mở Cài đặt để nhập.";
    case ERROR_CODES.RATE_LIMITED:
      return "Đã vượt giới hạn yêu cầu. Vui lòng thử lại sau ít phút.";
    case ERROR_CODES.UNKNOWN_MODEL:
      return "Model OpenRouter không tồn tại hoặc không khả dụng.";
    case ERROR_CODES.BAD_RESPONSE:
      return "Phản hồi từ máy chủ không hợp lệ.";
    case ERROR_CODES.EMPTY_RESPONSE:
      return "AI trả về phản hồi trống. Vui lòng thử lại.";
    case ERROR_CODES.NO_RESULT:
      return "Không tìm thấy kết quả tra từ.";
    default:
      return "Đã xảy ra lỗi. Vui lòng thử lại.";
  }
}
