# UX/UI Overhaul — Design Spec

- **Ngày**: 2026-08-16
- **Trạng thái**: Chờ user review
- **Nguồn**: Báo cáo review UX/UI toàn diện (điểm hiện tại 7.5/10, mục tiêu 9/10)
- **Phạm vi**: Toàn bộ 20 mục nâng cấp P0 + P1 + P2 từ báo cáo review

---

## 1. Mục tiêu

Đưa trải nghiệm UX/UI của extension từ 7.5/10 lên ~9/10 bằng cách:

1. Popup co giãn theo nội dung thay vì rộng cố định 560px.
2. Mọi bề mặt popup đều có đường đóng/dừng rõ ràng, không có luồng dead-end.
3. Nội dung hiển thị nhất quán ngôn ngữ theo `targetLanguage` (kể cả POS labels).
4. Hỗ trợ dark mode tự động cho popup và trigger icon.
5. Settings phản hồi đúng trạng thái (dirty-state, version động, verify API key).
6. Nội dung từ điển trở nên tương tác được (click synonym/phrase để tra tiếp).

## 2. Non-goals

- **Không** i18n hóa trang Settings (giữ tiếng Việt như hiện tại — đồng bộ theo sản phẩm).
- **Không** thêm setting bật/tắt dark mode thủ công — chỉ theo `prefers-color-scheme`.
- **Không** thêm lịch sử back/stack cho popup khi tra từ lồng nhau (có thể làm sau).
- **Không** thay đổi service layer, message protocol hiện có (trừ việc dùng lại `OPEN_SETTINGS` đã tồn tại).
- **Không** thêm permission mới vào manifest.

## 3. Nguyên tắc chung

- Giữ nguyên isolation Shadow DOM (closed) và cơ chế style inline injection.
- `copy.ts` vẫn là nguồn i18n duy nhất của popup; mở rộng thêm key, không đổi pattern `getPopupCopy`.
- Màu sắc luôn qua CSS token (`--background`, `--primary`…), không hard-code trừ trường hợp đã kiểm chứng (code block `bg-slate-950` giữ nguyên ở cả 2 theme).
- Test theo pattern hiện có: `scripts/test-*.mjs` (pure logic) + checklist thủ công trong README.
- Mọi phase mới đều phải có stale-guard bằng `currentRequestId` như flow hiện tại.

---

## 4. Workstreams

Các mục được nhóm theo cụm file để implement liền mạch. Số mục (1–20) khớp với báo cáo review.

### WS-A — Kích thước & khung popup (mục 1, 17, 18)

**A1. Adaptive width (mục 1 — P0)**

Hiện trạng: `placePopup` (`src/content/index.tsx:296-301`) set cứng `popup.style.width = min(560, viewport-24)` khiến popup luôn rộng tối đa.

Thay đổi:

- `src/components/dictionary/DictionaryPopup.tsx` — root dialog đổi từ `w-full max-w-[min(560px,…)]` sang:
  ```
  w-fit min-w-[340px] max-w-[min(560px,calc(100vw-24px))]
  ```
- `src/content/index.tsx` `placePopup()` — bỏ 2 dòng set `style.width` và `style.maxWidth` cứng; giữ `maxHeight`. Kích thước đo được từ `getBoundingClientRect()` (đã có) tiếp tục được dùng cho `constrainPopupSize` → `computePopupPosition`, không đổi logic positioning.
- `src/content/positioning.ts` — không đổi (`constrainPopupSize` vẫn là chặn trên).
- Host element (`hostEl`) vẫn được set width/height theo kích thước đo được sau render — giữ nguyên cơ chế double-pass rAF (`schedulePopupPlacement` với 8 attempts) để đo sau khi content render xong.
- Riêng phase `translation-*` (panel văn bản): panel đã dùng `w-full`; root `w-fit` sẽ co theo min-width 340 — chấp nhận được vì nội dung text thường dài. `TextTranslationPanel` thêm `min-w-[300px]` cho các section để tránh quá hẹp.

Kiểm chứng: từ ngắn ("run") → popup ~340–400px; mục AI markdown dài/rộng table → popup chạm max 560px; table/code vẫn scroll ngang trong `ext-markdown-*-scroll`.

**A2. Nhất quán kích thước tiêu đề (mục 17 — P2)**

- `DictionaryPopup.tsx` các block loading (~dòng 107), error (~142), empty (~150): `text-lg` → `text-xl` để khớp `DictionaryHeader` (`text-xl`). Trọng số/giãn cách giữ nguyên.

**A3. Bỏ viewport watcher polling 50ms (mục 18 — P2)**

Hiện trạng: `startViewportWatcher` (`src/content/index.tsx:353-368`) polling `setTimeout` 50ms suốt lúc popup mở.

Thay đổi: xóa `startViewportWatcher`/`stopViewportWatcher` và các call site. Việc re-place đã được đảm bảo bởi `resizeListener` (`resize` + `scroll` capture + `visualViewport.resize/scroll`) — vốn đã lắngnghe đầy đủ. Pinch-zoom được `visualViewport` events bao phủ.

Rủi ro chấp nhận: thay đổi viewport do SPA tự mutate không phát event sẽ không tự re-place (hiếm, và scroll tiếp sẽ tự sửa).

---

### WS-B — Header popup & nội dung từ điển (mục 2, 5, 12 + badge cleanup)

**B1. Nút đóng (X) (mục 2 — P0)**

- `DictionaryPopup.tsx`: thêm prop `onClose: () => void`; render nút X (icon `X` của lucide, variant ghost, `h-7 w-7`, `aria-label={labels.close}`) **absolute top-1.5 right-1.5 z-10** trong root dialog — luôn hiện ở mọi phase (loading/ready/empty/error/translation), vì phase translation không có `DictionaryHeader`.
- `src/content/index.tsx` `PopupContainer`: truyền `onClose={closePopup}`.
- Copy `close`/`closeTooltip` đã có sẵn ở `copy.ts` cả 3 ngôn ngữ — dùng lại, không thêm key mới.
- Chỉ cân chỉnh padding: `DictionaryHeader` các nút hành động hiện ở top-right có thể đè lên X — chuyển cụm Copy/Ask-AI của `DictionaryHeader` xuống **dưới hàng phonetics** (hàng mới, căn phải) để góc trên phải chỉ dành cho X. Cách này tránh 2 cụm nút chồng nhau và giữ F-pattern đọc từ trái sang.

**B2. Localize part-of-speech (mục 5 — P0)**

- `src/components/dictionary/partOfSpeech.ts`: thêm `POS_LABELS: Record<"vi"|"zh-CN", Record<string,string>>` covering các POS phổ biến từ dictionaryapi.dev (noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, exclamation, determiner, numeral, abbreviation). Bản vi: danh từ, động từ, tính từ, trạng từ, đại từ, giới từ, liên từ, thán từ (interjection), cảm thán từ (exclamation), hạn định từ, số từ, viết tắt. Bản zh: 名词, 动词, 形容词, 副词, 代词, 介词, 连词, 叹词, 感叹语, 限定词, 数词, 缩写.
- `getPartOfSpeechLabels(entry, targetLanguage?)`: trả label đã dịch khi `targetLanguage` là `vi`/`zh-CN`; fallback về label gốc nếu không có trong map (an toàn với POS lạ).
- `MeaningSection.tsx` (dòng 35) và `DictionaryHeader.tsx` (dòng 36) truyền `targetLanguage` xuống.
- `en` giữ nguyên tiếng Anh.

**B3. Render wordForms (mục 12 — P1)**

Đã xác minh: `freeDictionaryApi.ts:186-194` populate `wordForms` và `translation.ts:73` truyền qua — chỉ thiếu UI.

- `DictionaryHeader.tsx`: khi `entry.wordForms?.length`, thêm hàng dưới phonetics: label nhỏ `copy.wordFormsLabel` + các form nối bằng " · " dạng text muted. Thêm key mới vào `copy.ts`: vi `"Các dạng từ: "`, en `"Word forms: "`, zh-CN `"词形："`.

**B4. Dọn badge implementation-detail (kèm mục 2 — P2)**

- Xóa badge `"Cache"` ở `DictionaryHeader.tsx:118-122` (không mang thông tin cho người dùng).
- Xóa badge `"FreeDictionaryAPI"` (dòng 123-127); nguồn dữ liệu đã được nêu trong Settings → About và banner `partial` — đủ chỗ.
- Giữ badge `"AI"` (có ý nghĩa: kết quả do AI sinh).

---

### WS-C — Đặt lại tên tab AI (mục 3 — P0)

- `copy.ts`: `aiTab` đổi thành `"AI"` cho cả 3 ngôn ngữ (đang là `"OpenRouter"`).
- `tabListLabel` giữ "Nguồn giải thích". Context vendor chỉ còn ở Settings (đúng chỗ — đó là nơi cấu hình).

---

### WS-D — Luồng empty/error & điều khiển stream (mục 4, 9)

**D1. Empty state không API key → mở Settings (mục 4 — P0)**

Đã xác minh: `MESSAGE_TYPES.OPEN_SETTINGS` (`constants.ts:11`) và handler background (`background/index.ts:165-169`, gọi `chrome.runtime.openOptionsPage()`) **đã tồn tại sẵn** — chỉ cần dùng.

- `EmptyState.tsx`: thêm prop `onOpenSettings: () => void`. Khi `!hasApiKey`: nút chính đổi thành icon `Settings2` + label `copy.openSettings` (key mới: vi `"Mở Cài đặt"`, en `"Open Settings"`, zh `"打开设置"`), gọi `onOpenSettings`. Khi có key: giữ "Hỏi AI để có kết quả".
- `src/content/index.tsx`: handler `openSettingsPage()` = `void sendMessage(MESSAGE_TYPES.OPEN_SETTINGS, undefined)` rồi `closePopup()`; truyền vào `PopupContainer` → `DictionaryPopup` → `EmptyState`.
- Tương tự, `DictionaryHeader` khi `!hasApiKey` ẩn nút Ask AI? **Không** — giữ nút, vì background vẫn trả lỗi `MISSING_API_KEY` có toast hướng dẫn rõ (luồng này đã hoạt động đúng). Chỉ empty-state là dead-end thật.

**D2. Nút Dừng khi AI đang stream (mục 9 — P1)**

- `AISection.tsx`: thêm prop `onStop?: () => void`. Khi `loading === true`, hiển thị nút nhỏ outline "Dừng" (icon `Square`) sticky ở góc phải hàng đầu của panel AI (dùng flex header hàng đầu mới: spinner/trạng thái bên trái, nút Dừng bên phải).
- `src/content/index.tsx`: `handleStopAI()` = `stopAIStream()` + `setState({ aiLoading: false })` — giữ nguyên text đã stream một phần, không set `aiError`. Nếu chưa có `streamText` nào và bị dừng, hiển thị `aiNoResponse` + retry (state đã xử lý sẵn).
- Nút Ask AI ở `DictionaryHeader` khi `aiLoading` hiện "Đang hỏi…" + disabled — giữ nguyên (không nhân đôi nút dừng).

---

### WS-E — Dark mode (mục 6, 13)

**E1. Dark mode cho popup (mục 6 — P1)**

- `src/styles/popup.css`: thêm block `@media (prefers-color-scheme: dark)` đặt lại toàn bộ token theo bộ giá trị dark đã có sẵn ở `global.css:29-49` (`--background: 222.2 84% 4.9%`, `--popover: 222.2 47% 8%`, v.v.). `color-scheme: light dark` đã khai báo — scrollbar sẽ khớp theme.
- Kiểm tra riêng:
  - Banner `fallback` dùng `bg-amber-500/10` — đọc tốt trên dark, giữ nguyên.
  - Code block markdown `bg-slate-950 text-slate-50` — vốn đã "dark", khớp cả 2 theme, giữ.
  - Skeleton/muted/accent token tự flip.
- Toast (sonner) render trong cùng shadow DOM nên nhận token tự động qua CSS var đã inject — cần verify màu richColors của sonner trên nền dark trong checklist thủ công.

**E2. Trigger icon có nền pill (mục 13 — P1)**

- `src/content/index.tsx` `SelectionTriggerContainer`: nút trigger đổi styling thành pill nổi: `rounded-lg border border-border bg-background/95 shadow-md backdrop-blur p-1.5` (icon 24px bên trong, tổng ~36px như cũ). Nhờ token, pill tự đảo màu theo theme (E1).
- Giữ hover scale/opacity và focus-visible ring hiện có.

---

### WS-F — Feedback: toast & copy (mục 7)

**F1. Đổi vị trí Toaster (P1)**

- `src/content/index.tsx` `PopupContainer`: `<Toaster position="top-center">` → `position="bottom-center">` — toast lỗi (audio/AI) xuất hiện gần popup hơn, không còn "nổi giữa trang web người lạ".

**F2. Inline copy feedback (P1)**

- `DictionaryHeader.tsx` nút copy và 2 nút copy của `TextTranslationPanel.tsx`: thêm state `copied` cục bộ (timeout 1.6s), icon `Copy` → `Check` + màu `text-emerald-600` khi thành công; bỏ `toast.success`, giữ `toast.error` khi fail. Giảm hoàn toàn phụ thuộc toast cho hành vi thành công.

---

### WS-G — Synonyms/phrases click-through (mục 8)

- `MeaningSection.tsx`: synonym & phrase đổi từ `Badge` sang `button` styling giống badge hiện tại (border/secondary) + `hover:bg-accent cursor-pointer`, `aria-label={copy.lookupWord(x)}` (key mới: vi `"Tra từ {x}"`, en `"Look up {x}"`, zh `"查询 {x}"`).
- Chuỗi prop mới: `onLookupWord(word: string)` xuyên `MeaningSection` ← `DictionaryPopup` ← `src/content/index.tsx`.
- Handler `lookupWord(text)` trong content script:
  1. Bỏ qua nếu `text` === từ hiện tại.
  2. `classifySelection(text)` để lấy `lookupText` sạch.
  3. `stopAIStream()`, `stopDictionaryTranslation()`, tăng `currentRequestId`.
  4. Giữ nguyên vị trí popup hiện tại (`popupPosition` không đổi, không cần `SelectionInfo` mới), set `state.word = lookupText`, `phase = {kind:"loading"}` và chạy lại đúng pipeline lookup + translate như trong `openPopup` (tách phần pipeline ra hàm dùng chung `runLookup(lookupText, pageLanguage, myId)` để không nhân bản code).
  5. AI request cho từ mới: chỉ có `word` (không sentence/context) — chấp nhận được, ghi chú trong system prompt request vẫn hoạt động.
- Note: đây là lý do không làm back-stack (non-goal) — mỗi lần click thay thế nội dung popup.

---

### WS-H — Settings (mục 10, 11, 19, 20, 16)

**H1. Dirty-state & cảnh báo mất thay đổi (mục 10 — P1)**

- `App.tsx`: giữ `baseline` snapshot (set sau load và sau mỗi save thành công). `isDirty` = so sánh từng field của `next-settings-hợp-le` (bao gồm `apiKey.trim()`, `model.trim() || default`, `systemPrompt`) với baseline.
- Nút Lưu: `disabled={!isDirty || saveState === "saving"}` + `opacity` giảm khi disable.
- `beforeunload` listener (chỉ gắn khi `isDirty`): `event.preventDefault()` để browser hiện confirm mặc định.
- Đổi section khi dirty: state đang giữ ở `App` nên không mất — không cần cảnh báo khi đổi section. Sau save thành công: cập nhật baseline.

**H2. Version động (mục 11 — P1)**

- `AboutSection.tsx`: `chrome.runtime.getManifest()?.version` (fallback `"—"` trong môi trường preview/test). Bỏ chuỗi "1.0" hard-code.

**H3. Minh bạch hoá System Prompt (mục 19 — P2)**

- `OpenRouterSection.tsx` mô tả dưới Textarea đổi thành 2 câu tách bạch: (1) prompt điều khiển câu trả lời của tab AI trong popup; (2) khi từ điển không có dữ liệu, prompt này cũng định dạng JSON bản dịch fallback cho tab Từ điển.

**H4. Nút "Kiểm tra key" (mục 20 — P2)**

- `OpenRouterSection.tsx`: nút outline "Kiểm tra key" cạnh nút "Xóa key"; state `keyCheck: "idle"|"checking"|"ok"|"error"`.
- Gọi `GET_MODELS` với `apiKey` hiện tại (đúng plumbing `ModelSelector` đang dùng). Kết quả hiển thị inline dưới input: ok → `"Key hợp lệ — n model khả dụng"`; error → thông báo lỗi. Disable khi đang checking hoặc key rỗng.

**H5. ModelSelector polish (mục 16 — P2)**

- Trigger hiển thị friendly name: khi có value, nếu danh sách model đã cache/theo apiKey chứa value → hiện `model.name` làm chính, `model.id` phụ (hai dòng nhỏ); không có dữ liệu → giữ hiện id như cũ. Cache module-level đã có sẵn (`modelCache`) — thêm hiệu ứng load-để-lấy-tên nếu cache trống và có key.
- Sửa debounce bug `handleQueryChange` (`ModelSelector.tsx:99-103`): xóa `setTimeout` thừa (đang set cùng giá trị 2 lần); filter local trực tiếp — 500+ item filter tức thời, không cần debounce.

---

### WS-I — A11y & Onboarding (mục 14, 15)

**I1. Focus trap trong popup (mục 14 — P2)**

- `src/content/index.tsx` `PopupContainer`: thêm `onKeyDown` Tab handler trên dialog: gom focusable elements trong shadow root (`button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])` — filter visible), wrap Tab/Shift+Tab về đầu/cuối.
- Dialog thêm `aria-modal="true"` (popup đóng khi click ngoài — hành xử modal thực).
- Esc & click-outside giữ nguyên.

**I2. Playground preview trong Settings (mục 15 — P2)**

- Content script không chạy trên trang extension → playground là **preview component tĩnh**, không phải trigger thật.
- `PopupDictionarySection.tsx`: thêm Card cuối "Xem trước popup" render trực tiếp `<DictionaryPopup>` với mock `DictionaryEntry` cố định (từ "beautiful": 1 meaning, IPA UK/US, 2 examples, phrases, synonyms, wordForms), `phase = {kind:"ready"}`, `targetLanguage = settings.targetLanguage`, các callback là no-op (note nhỏ "Bản xem trước — chỉ hiển thị").
- Người dùng thấy ngay popup sẽ trông thế nào theo ngôn ngữ đã chọn; mock giữ type `DictionaryEntry` để không drift schema.

---

## 5. Thứ tự thực hiện

| Sprint | Workstreams | Mục |
|---|---|---|
| 1 (P0) | A1, B1, C, D1, B2 | 1, 2, 3, 4, 5 |
| 2 (P1) | E1+E2, F1+F2, G, D2, H1, H2, B3 | 6, 7, 8, 9, 10, 11, 12, 13 |
| 3 (P2) | I1, I2, H3, H4, H5, A2, A3, B4 | 14, 15, 16, 17, 18, 19, 20 (+badge) |

Dependency trong sprint:

- B1 (X button) làm **trước** B4 (dọn badge) — cùng file `DictionaryHeader`.
- A1 (adaptive width) làm trước I2 (playground) để preview đúng hệ width mới.
- E1 (token dark) trước E2 (trigger pill dùng token).
- G (click-through) phụ thuộc tách hàm `runLookup` — làm sau khi A1 ổn định placement.

## 6. Error handling

- `lookupWord` thất bại → dùng lại phase error hiện có + retry (retry sẽ tra lại từ mới, không phải selection gốc — hành vi đúng).
- `OPEN_SETTINGS` fail (background không phản hồi): popup vẫn đóng, người dùng có thể mở Settings từ toolbar icon — không cần toast phụ.
- Stop stream giữa chừng: giữ partial text, KHÔNG set `aiError` — đây là chủ động của user, không phải lỗi.
- Dirty-state compare: dùng trim giống logic save hiện tại để tránh dirty "ma" (khoảng trắng).

## 7. Testing

Test tự động (pattern `scripts/test-*.mjs`, cập nhật/tạo mới):

- `test-part-of-speech.mjs` — map POS vi/zh, fallback label gốc, dedupe giữ nguyên.
- `test-popup-layout.mjs` — class width mới (`w-fit min-w-[340px]`), đóng X có aria-label, title size nhất quán.
- `test-popup-copy.mjs` — key copy mới (wordFormsLabel, openSettings, lookupWord, stop), tab "AI" 3 ngôn ngữ.
- `test-settings-persistence.mjs` — dirty detection (trim, model default, systemPrompt), baseline reset sau save.
- `test-selection-trigger.mjs` — class pill mới, aria-label giữ nguyên.
- `test-markdown-rendering.mjs` — unchanged, chỉ chạy lại để bảo đảm không hồi quy.

Checklist thủ công bổ sung vào README (sau mục hiện có):

- [ ] Từ ngắn → popup ~340px; AI markdown rộng → 560px; không vượt viewport.
- [ ] Nút X đóng popup ở mọi phase; Tab không thoát ra trang chủ; aria-modal đúng.
- [ ] Dark mode OS → popup & trigger tự đảo màu, banner amber vẫn đọc được.
- [ ] Copy → icon check 1.6s, không toast thành công; toast lỗi bottom-center.
- [ ] Click synonym/phrase → popup tra từ mới tại chỗ, không nhảy vị trí.
- [ ] Empty state không key → mở đúng tab Settings.
- [ ] Stream AI → nút Dừng giữ partial text.
- [ ] Settings: đổi giá trị → nút Lưu enable; đóng tab khi dirty → cảnh báo; Lưu xong → disable trở lại.
- [ ] About hiện 1.1.1 (đúng manifest).
- [ ] "Kiểm tra key" đúng/sai hiển thị inline.
- [ ] Playground hiển thị đúng theo ngôn ngữ đang chọn.

## 8. Risks & mitigations

| Rủi ro | Mitigation |
|---|---|
| `w-fit` + đo double-rAF gây nháy khi đổi phase | Retry loop 8 attempts đã có; giữ `animate-fade-in`; min-width 340 chống co giật |
| Dark mode làm một số màu hardcoded (amber banner, slate-950) lệch | Đã rà: 2 màu này đọc tốt ở cả 2 theme; verify thủ công trong checklist |
| Focus trap phá navigation tab nội bộ của Radix | Trap chỉ bắt Tab/Shift+Tab ở mức dialog; các nút tab popup là button thuần, vẫn Tab được |
| Bỏ 50ms watcher → popup lệch khi zoom | `visualViewport.resize` đã vào `resizeListener`; verify pinch-zoom thủ công |
| Playground mock drift khỏi data thật | Mock type `DictionaryEntry` cố định, tối giản, có comment "mock" |
| Dirty-state false positive do trim/model default | Dùng đúng normalize logic như `handleSave` khi compare |
