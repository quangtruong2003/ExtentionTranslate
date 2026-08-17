# Phát hành ExtentionTranslate

Workflow `.github/workflows/release.yml` tự chạy khi có push vào `main`.

## Quy tắc tăng version

Commit dùng Conventional Commits:

- `fix:` hoặc `perf:` → tăng patch, ví dụ `1.2.3` → `1.2.4`.
- `feat:` → tăng minor, ví dụ `1.2.3` → `1.3.0`.
- `feat!:` hoặc footer `BREAKING CHANGE:` → tăng major, ví dụ `1.2.3` → `2.0.0`.
- `docs:`, `chore:`, `test:`, `ci:`, `style:`, `build:` và commit không đúng format → không tạo release.

Workflow đọc toàn bộ commit từ tag release gần nhất, lấy mức tăng cao nhất, cập nhật đồng bộ `package.json` và `public/manifest.json`, build extension, đóng gói `dist` thành ZIP rồi tạo GitHub Release. Commit tự sinh có `[skip ci]` để không tạo vòng lặp.

Release CI chạy toàn bộ test tự động. `test:content-script` được chạy local trên Windows nơi có Chrome/Edge; trên runner Linux của GitHub Actions, test E2E này được bỏ qua có ghi log vì cần browser executable và môi trường desktop Windows.

Ví dụ:

```text
feat: add vocabulary export
```

Sau khi push lên `main`, GitHub Actions sẽ tạo version minor tiếp theo và đính kèm `ExtentionTranslate-v<version>.zip` vào Release.
