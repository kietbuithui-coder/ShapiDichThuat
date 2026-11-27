# SHAPI FLOW — Hướng dẫn Cài đặt, Cấu hình API, Đóng gói & Danh sách Giới hạn

## 1. Yêu cầu môi trường
- **Node.js:** `>= 20.x` (khuyến nghị `22.x`)
- **npm:** `>= 10.x`
- **Đóng gói Android (tùy chọn):** Android Studio Ladybug+, JDK 17, Android SDK 34/35
- **Đóng gói iOS (tùy chọn trên macOS):** Xcode 16+, CocoaPods

---

## 2. Cài đặt & Chạy ứng dụng

```bash
# 1. Cài đặt thư viện phụ thuộc
npm install

# 2. Khởi chạy Backend AI Gateway (cổng 3001) + Giao diện Mobile Web/PWA (cổng 5173)
npm run dev

# 3. Chạy bộ kiểm thử tự động (Unit + Integration + 16 Tình huống thực tế)
npm test

# 4. Build bản thương mại tối ưu
npm run build
```

---

## 3. Cấu hình Nhà cung cấp AI (Không nhúng khóa vào ứng dụng di động)

Tạo tệp `.env` tại thư mục gốc (chỉ đọc bởi tiến trình `server/`, tuyệt đối không có tiền tố `VITE_` để ngăn rò rỉ sang client):

```env
PORT=3001
# Tùy chọn nâng cấp sang Cloud AI (nếu để trống, hệ thống tự động dùng Local Contextual CJK Engine)
OPENAI_API_KEY=
GEMINI_API_KEY=
DEEPGRAM_API_KEY=
```

- Khi chưa cấu hình khóa Cloud AI hoặc mất kết nối tới nhà cung cấp ngoài, máy chủ tự động vận hành **Local Contextual CJK→Vietnamese Engine** (kết hợp phân tích hình thái học `kuromoji`, `segmentit`, `opencc-js`, `pinyin-pro`, `hanviet-pinyin-words`, `es-hangul`, bộ nhớ ngữ cảnh hội thoại và Từ điển cá nhân) — đảm bảo ứng dụng luôn hoạt động ổn định, không bao giờ sập thành màn hình trắng.

---

## 4. Hướng dẫn Đóng gói Native Android & iOS (Capacitor)

```bash
# Build web bundle trước khi đồng bộ sang dự án native
npm run build

# Đồng bộ cấu hình Capacitor và plugin native
npx cap sync

# Mở Android Studio để ký và xuất APK / AAB
npx cap open android

# Mở Xcode (trên macOS) để cấu hình Signing & xuất IPA
npx cap open ios
```

Mã nguồn module Native chuyên biệt nằm tại:
- `native/android/` — `LinguaFlowPlugin.kt`, `FloatingSubtitleService.kt`, `AudioCaptureController.kt`, `AndroidManifest.snippet.xml`
- `native/ios/` — `LinguaFlowPlugin.swift`, `PiPSubtitlePlayerController.swift`, `ShareExtensionViewController.swift`, `Info.plist.snippet.xml`

---

## 5. Danh sách Quyền truy cập & Nguyên tắc Tối thiểu hóa

| Quyền truy cập | Nền tảng | Thời điểm yêu cầu | Mục đích & Phương án thay thế khi từ chối |
|---|---|---|---|
| `RECORD_AUDIO` / Microphone | Android, iOS, Web | Chỉ khi bấm *Bắt đầu nghe* bằng Micro | Thu âm lời nói trực tiếp; nếu từ chối, người dùng vẫn dịch được Video có phụ đề hoặc nhập tệp `.SRT/.VTT/.ASS` |
| `MediaProjection` / Chia sẻ tab | Android 10+, Desktop Web | Chỉ khi chọn nguồn *Âm thanh ứng dụng / Tab* | Nhận âm thanh livestream được phép chia sẻ; nếu bị chặn hoặc từ chối, gợi ý chuyển sang Micro |
| `SYSTEM_ALERT_WINDOW` | Android | Chỉ khi bật *Phụ đề nổi trên ứng dụng khác* | Hiển thị khung phụ đề kéo thả bên ngoài ứng dụng; nếu từ chối, hiển thị phụ đề ngay trong SHAPI FLOW |
| Bộ chọn tệp (`File Picker` / `PHPicker`) | Android, iOS, Web | Khi chọn *Nhập video* hoặc *Nhập phụ đề* | Chỉ đọc đúng 1 tệp người dùng chọn, **không** yêu cầu quyền đọc toàn bộ thư viện ảnh/tệp |

---

## 6. Danh sách Giới hạn Kỹ thuật Đã xác định & Trạng thái Chức năng

### Đã hoàn thành & Kiểm chứng thực tế
- Nhận diện và dịch **Tiếng Hàn (`ko`), Tiếng Nhật (`ja`), Tiếng Trung Giản thể (`zh-CN`) & Phồn thể (`zh-TW`) → Tiếng Việt (`vi`)** qua pipeline thực tế.
- Tự động nhận diện ngôn ngữ có chống nhảy ngôn ngữ khi gặp từ mượn.
- 5 phong cách dịch (*Tự nhiên, Sát nghĩa, Dễ hiểu, Hội thoại, Giải trí*) + 3 mức độ tự nhiên + Bộ nhớ ngữ cảnh + Từ điển cá nhân + Bảo vệ tên riêng.
- Hệ thống phụ đề 22 thuộc tính, 8 mẫu preset gốc + lưu/nhân bản/đổi tên/xóa preset cá nhân.
- Trình chỉnh sửa kéo thả trực quan **Subtitle Customization Studio** + **Snap Grid Layout Canvas** + thanh công cụ linh hoạt + Hoàn tác/Khôi phục.
- Trình phát Video tích hợp có đồng bộ timestamp, tua video không chồng chữ, chỉnh độ trễ thủ công `±5.0s`, tốc độ `0.5x–2.0x`, PiP và xuất `.SRT/.VTT/.TXT`.
- Nhập và dịch tệp phụ đề `.SRT`, `.VTT`, `.ASS` bảo toàn dấu thời gian và dấu tiếng Việt.
- Tra cứu từ vựng CJK theo chạm (Romaja, Furigana, Pinyin, Hán-Việt), Câu đã lưu, Lịch sử tìm kiếm, Light/Dark Mode, Trợ năng phóng chữ & Reduce Motion.

### Giới hạn hệ điều hành & Phần cần kiểm chứng thêm trên thiết bị vật lý
1. **Nội dung có DRM (Netflix, Disney+, v.v.):** Hệ điều hành chặn thu âm/ghi hình theo luật bản quyền; SHAPI FLOW không vượt rào DRM và chỉ hỗ trợ nghe ngoài qua Micro nếu hợp lệ.
2. **Phụ đề nổi toàn hệ thống trên iOS:** Không khả dụng do giới hạn iOS Sandbox; sử dụng Trình phát nội bộ, Share Sheet và Picture-in-Picture thay thế.
3. **Module Kotlin/Swift Native (`native/android`, `native/ios`):** Đã viết đầy đủ mã nguồn bridge chuẩn Capacitor, cần biên dịch bằng Android Studio / Xcode và kiểm chứng thêm trên đa dạng ROM tùy biến (Xiaomi MIUI/HyperOS, Samsung OneUI, OPPO ColorOS) đối với chính sách tiết kiệm pin chạy nền dài hạn.
