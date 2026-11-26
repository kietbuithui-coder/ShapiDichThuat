# LINGUA FLOW — Dịch thuật Video, Livestream & Phụ đề AI trên Điện thoại

**LINGUA FLOW** là ứng dụng dịch thuật nội dung nghe nhìn theo thời gian thực (**Tiếng Hàn, Tiếng Nhật, Tiếng Trung Giản thể & Phồn thể → Tiếng Việt**), tập trung vào trải nghiệm xem livestream, video, hội thoại trực tiếp và tùy biến phụ đề chuyên sâu.

---

## Kiến trúc & Điểm nổi bật

- **Ngôn ngữ thiết kế *Fluid Minimal Intelligence*:** Hỗ trợ đầy đủ **Light Mode** (mặc định ban ngày), **Dark Mode** (tối ưu xem đêm) và **Theo hệ thống**, tối ưu thao tác một tay trên màn hình điện thoại dọc & ngang.
- **5 Chế độ dịch thực tế:**
  1. **Dịch Livestream:** Luồng nhận diện từng phần (streaming), phân biệt trực quan *phụ đề tạm thời* và *phụ đề đã xác nhận*, chế độ cửa sổ phụ đề nổi và chế độ tối giản.
  2. **Dịch Video (Trình phát tích hợp):** Mở tệp video từ máy (`.MP4`, `.WEBM`, `.MOV`), nhập URL hợp lệ, đính kèm hoặc tự tạo phụ đề theo lời nói, tua video không chồng chữ, chỉnh độ trễ thủ công (`±5.0s`), tốc độ `0.5x–2.0x` và Picture-in-Picture (PiP).
  3. **Nghe trực tiếp bằng Micro:** Thu âm trực tiếp với biểu đồ sóng âm RMS thực tế, khử nhiễu, cảnh báo âm lượng nhỏ và ngắt micro tuyệt đối ngay khi kết thúc phiên.
  4. **Dịch phụ đề có sẵn:** Nhập `.SRT`, `.VTT`, `.ASS`/`.SSA`, bảo toàn 100% dấu thời gian, cho phép chỉnh sửa từng câu (phân biệt *Bản dịch AI* và *Bản bạn đã sửa*) và xuất `.SRT`, `.VTT`, `.TXT`, `SRT Song ngữ`.
  5. **Dịch nhanh một câu:** Tra nhanh câu ngắn bằng giọng nói hoặc văn bản kèm đọc mẫu TTS.
- **Subtitle Customization Studio & Snap-Grid Layout:**
  - Chỉnh trực quan **22 thuộc tính phụ đề**, **8 mẫu preset gốc** (*Live, Classic, Cinema, Minimal, Floating Glass, High Contrast, Compact, Study*) và lưu/nhân bản/đổi tên/xóa preset cá nhân không giới hạn.
  - Kéo thả trực tiếp khung phụ đề, tay nắm chỉnh độ rộng, lưới căn chỉnh **Snap Grid**, tùy biến thứ tự/ẩn hiện thanh công cụ và khôi phục an toàn 1 chạm.
- **AI & Ngữ cảnh CJK → Tiếng Việt:**
  - Kiến trúc đa nhà cung cấp bảo mật tại Backend (`server/`): hỗ trợ nâng cấp qua khóa `.env` (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `DEEPGRAM_API_KEY`) **không bao giờ nhúng khóa vào ứng dụng di động**, kết hợp **Local Contextual CJK Morphological Engine** (`kuromoji`, `segmentit`, `opencc-js`, `pinyin-pro`, `hanviet-pinyin-words`, phân tích đuôi kính ngữ Hàn/Nhật, bộ nhớ ngữ cảnh hội thoại, Từ điển cá nhân & bảo vệ tên riêng).
  - Chạm trực tiếp vào bất kỳ từ nào trên câu gốc để tra cứu phiên âm xác thực (**Romaja**, **Hiragana/Romaji**, **Pinyin**, **Âm Hán-Việt**) và lưu vào Từ điển cá nhân.
- **Tầng Native Android & iOS (`native/` + Capacitor):**
  - `native/android/` (Kotlin): `LinguaFlowPlugin.kt`, `FloatingSubtitleService.kt` (`WindowManager` + `ForegroundService` + Notification Controls), `AndroidManifest.snippet.xml`.
  - `native/ios/` (Swift): `LinguaFlowPlugin.swift` (`AVPictureInPictureController`, `AVAudioSession`), `ShareExtensionViewController.swift`.

---

## Tài liệu Dự án (`docs/`)

1. [`docs/01-PRD-Product-Requirements.md`](docs/01-PRD-Product-Requirements.md) — Tầm nhìn sản phẩm, nhóm người dùng, phạm vi ngôn ngữ & ma trận rủi ro.
2. [`docs/02-Technical-Architecture-and-OS-Limits.md`](docs/02-Technical-Architecture-and-OS-Limits.md) — Kiến trúc 10 module, pipeline bất đồng bộ và phân tích trung thực giới hạn Android / iOS / Web.
3. [`docs/03-Design-System-Fluid-Minimal-Intelligence.md`](docs/03-Design-System-Fluid-Minimal-Intelligence.md) — Màu sắc, typography đa ngữ CJK-Việt và thư viện 28 component.
4. [`docs/04-User-Guide-Setup-and-API-Config.md`](docs/04-User-Guide-Setup-and-API-Config.md) — Hướng dẫn cài đặt, cấu hình API, đóng gói APK/IPA, danh sách quyền và giới hạn kỹ thuật.

---

## Khởi chạy nhanh

```bash
npm install
npm run dev      # Chạy đồng thời Web UI + AI Gateway tại http://0.0.0.0:5173
npm test         # Chạy bộ kiểm thử tự động (Vitest)
npm run build    # Kiểm tra TypeScript & đóng gói bản Production
```
