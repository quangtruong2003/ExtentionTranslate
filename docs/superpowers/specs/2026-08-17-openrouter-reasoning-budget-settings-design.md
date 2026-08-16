# OpenRouter Reasoning and Budget Settings

## Goal

Cho phép người dùng chủ động cấu hình reasoning và giới hạn token trong trang Settings của extension, đồng thời giữ request OpenRouter hợp lệ, tương thích với settings cũ và ổn định khi streaming.

## Scope

Phạm vi áp dụng là luồng “Hỏi AI” dùng cho tab AI trong popup, gồm cả request streaming và non-streaming. Các request dịch từ điển JSON tiếp tục dùng budget riêng vì có schema và yêu cầu output khác.

## User-facing settings

Trong card “Hành vi AI” của OpenRouter Settings, giữ lại toggle hiện có và thêm:

- **Mức reasoning**: `Low`, `Medium`, `High`; mặc định `Low`.
- **Reasoning budget**: số token tùy chọn; để trống nghĩa là dùng mức reasoning ở trên. Khi nhập, budget chính xác sẽ được ưu tiên.
- **Max output tokens**: số token tối đa cho toàn bộ output; mặc định `1600` để giữ hành vi ổn định hiện tại.

Các trường số dùng input số, hiển thị đơn vị token, có mô tả ngắn. `Max output tokens` hợp lệ trong khoảng `512–8192`; `Reasoning budget` để trống hoặc hợp lệ trong khoảng `1024–8192`. Khi reasoning budget không nhỏ hơn max output tokens, Settings phải hiển thị lỗi và không cho lưu request cấu hình không hợp lệ.

## Settings data model and migration

Thêm vào `ExtensionSettings`:

```ts
openRouterReasoningEffort: "low" | "medium" | "high";
openRouterReasoningMaxTokens: number | null;
openRouterMaxTokens: number;
```

Giá trị mặc định:

```ts
openRouterReasoningEffort: "low";
openRouterReasoningMaxTokens: null;
openRouterMaxTokens: 1600;
```

`normalizeSettings` phải fallback các giá trị thiếu hoặc không hợp lệ về mặc định, đồng thời chuẩn hóa số token về số nguyên trong khoảng được hỗ trợ. Nếu reasoning budget đã lưu không nhỏ hơn max output tokens, normalize phải bỏ exact budget về `null` để request quay về effort an toàn. Settings cũ không có ba field mới vẫn phải load bình thường.

`Settings App` phải đưa ba field mới vào payload `composeNext`, discard và baseline comparison để thay đổi được lưu, hủy và hiển thị trạng thái dirty chính xác.

## Request mapping

Tạo một kiểu options dùng chung cho OpenRouter request của luồng Hỏi AI. Request streaming và non-streaming dùng cùng mapping:

```ts
const reasoning = !thinkingEnabled
  ? { effort: "none" }
  : reasoningMaxTokens !== null
    ? { max_tokens: reasoningMaxTokens }
    : { effort: reasoningEffort };
```

Body vẫn gửi `max_tokens` ở cấp request bằng `openRouterMaxTokens`. Khi reasoning tắt, không gửi reasoning budget đã lưu; khi reasoning bật và budget để trống, chỉ gửi `reasoning.effort`; không gửi đồng thời `reasoning.effort` và `reasoning.max_tokens`.

Background đọc settings đã normalize một lần cho mỗi request và truyền options vào cả `streamOpenRouter` và `callOpenRouter`. Request dịch từ điển JSON không nhận các setting này và giữ các hằng số budget hiện tại.

## Validation and error handling

- Settings UI chỉ cho phép giá trị số nguyên trong khoảng đã định nghĩa.
- `reasoning.max_tokens` phải nhỏ hơn `max_tokens` khi được bật, vì một số provider yêu cầu còn token cho phần trả lời cuối.
- Settings đã lưu từ phiên bản cũ hoặc bị sửa thủ công sẽ được normalize về giá trị an toàn; không làm crash extension.
- Không thay đổi cơ chế báo lỗi stream hiện có, bao gồm lỗi response bị cắt do đạt token limit.

## Testing

Bổ sung regression tests cho:

1. Default và migration của ba field mới.
2. Compose/save Settings có đủ ba field; discard khôi phục đúng giá trị.
3. Request body với reasoning tắt, effort và exact reasoning budget.
4. Max output tokens được truyền đúng vào streaming và non-streaming Hỏi AI.
5. Dictionary translation request không bị thay đổi budget.
6. Giá trị không hợp lệ và quan hệ budget không hợp lệ được normalize hoặc chặn ở UI.

Chạy các test hiện có liên quan đến Settings, OpenRouter stream/background contract và build extension trước khi commit code chức năng.

## Non-goals

- Không tạo editor JSON nâng cao cho toàn bộ OpenRouter parameters.
- Không tự động tải metadata model để thay đổi các mức reasoning theo từng model trong phiên bản này.
- Không áp dụng budget Hỏi AI vào các request dịch từ điển có schema JSON riêng.
