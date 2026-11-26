# LINGUA FLOW — Kiến trúc Kỹ thuật & Phân tích Giới hạn Hệ điều hành

## 1. Đánh giá và lựa chọn công nghệ

Sau khi đối chiếu yêu cầu về hiệu năng render phụ đề 60fps, thao tác kéo thả trực quan, truy cập âm thanh hệ thống, chạy nền và chi phí bảo trì trên cả Android, iOS và Mobile Web, hệ thống sử dụng kiến trúc **Hybrid Native-Core (Capacitor 8 + React 19 + TypeScript + Native Kotlin/Swift Modules + Node.js/WebSocket Backend)**:

1. **Tầng Giao diện & Subtitle Studio (`src/` — React 19 + TypeScript + Tailwind CSS):**
   - Tận dụng GPU compositing (`transform: translate3d`) cho thao tác kéo thả phụ đề và Snap Grid mượt ở 60fps/120fps mà không gây re-render toàn cây giao diện.
   - Hỗ trợ đầy đủ bộ ký tự đa ngôn ngữ (Tiếng Việt có dấu tổ hợp, Hangul, Kana/Kanji, Hán tự Giản thể/Phồn thể) và chế độ trợ năng (`prefers-reduced-motion`, phóng to chữ tự động xuống dòng).
2. **Tầng Native Android (`native/android/` — Kotlin, API 29–35):**
   - Xử lý những tác vụ đặc thù hệ điều hành mà tầng đa nền tảng thuần túy không thể đảm nhiệm tốt: `MediaProjection`, `AudioPlaybackCaptureConfiguration`, `WindowManager` (`TYPE_APPLICATION_OVERLAY`), `ForegroundService` (`mediaProjection|microphone`) và Notification Controls.
3. **Tầng Native iOS (`native/ios/` — Swift, iOS 16+):**
   - Tôn trọng tuyệt đối iOS Sandbox: sử dụng `AVPlayer`, `AVPictureInPictureController` để hiển thị phụ đề trong cửa sổ PiP hợp lệ, `AVAudioEngine` cho microphone độ trễ thấp và `ShareExtension` để nhận video/tệp phụ đề từ ứng dụng khác.
4. **Tầng Backend & AI Gateway (`server/` — Node.js + Express + WebSocket):**
   - Bảo vệ khóa API bí mật ở phía máy chủ (không bao giờ nhúng API key vào APK/IPA/JS bundle).
   - Cung cấp giao diện đa nhà cung cấp (`ASRProvider`, `TranslationProvider`) cùng **Local Contextual CJK→Vietnamese Engine** tích hợp phân tích hình thái học thực tế (`kuromoji` cho tiếng Nhật, `segmentit` + `opencc-js` + `pinyin-pro` + `hanviet-pinyin-words` cho tiếng Trung Giản/Phồn, `es-hangul` + bộ phân tích đuôi câu/kính ngữ cho tiếng Hàn).

---

## 2. Phân tích giới hạn kỹ thuật theo nền tảng (Trung thực kỹ thuật)

### 2.1. Android
- **Thu âm thanh từ ứng dụng khác (`AudioPlaybackCapture` — Android 10 / API 29+):**
  - *Khả thi khi:* Người dùng chấp nhận hộp thoại `MediaProjection` VÀ ứng dụng phát sử dụng `USAGE_MEDIA` / `USAGE_GAME` đồng thời không đặt `android:allowAudioPlaybackCapture="false"`.
  - *Giới hạn:* Các ứng dụng có DRM (Netflix, Disney+, một số nền tảng trả phí) hoặc ứng dụng chủ động chặn capture sẽ trả về luồng âm thanh im lặng. LINGUA FLOW **tuyệt đối không vượt rào DRM** và **không lạm dụng AccessibilityService**. Khi phát hiện luồng âm thanh bị chặn (RMS = 0 liên tục sau 3.5 giây), ứng dụng thông báo rõ nguyên nhân và đề xuất chuyển sang **Nghe bằng Micro**.
- **Phụ đề nổi (`SYSTEM_ALERT_WINDOW`):**
  - Chỉ yêu cầu quyền khi người dùng chủ động bật "Phụ đề nổi trên ứng dụng khác", kèm màn hình giải thích ngắn gọn trước khi mở cài đặt hệ thống. Tôn trọng `WindowInsets` (tai thỏ, camera đục lỗ, thanh điều hướng cử chỉ).

### 2.2. iOS
- **Giới hạn hệ điều hành:**
  - iOS **không cho phép** ứng dụng bên thứ ba tự vẽ cửa sổ overlay tùy ý đè lên mọi ứng dụng khác trên màn hình chính.
  - iOS **không cho phép** một ứng dụng thông thường thu luồng âm thanh phát nội bộ của mọi ứng dụng bên ngoài tùy ý.
- **Giải pháp thực tế trên iOS:**
  1. Dịch video trực tiếp trong **Trình phát tích hợp** của LINGUA FLOW (chọn tệp qua `PHPicker` / `UIDocumentPicker` mà không cần xin quyền toàn bộ thư viện ảnh).
  2. Nhận liên kết video hợp lệ hoặc tệp video/phụ đề qua **iOS Share Sheet**.
  3. Hỗ trợ **Picture-in-Picture (PiP)** đối với video đang phát hợp lệ trong trình phát LINGUA FLOW.
  4. Chế độ **Nghe trực tiếp bằng Micro** khi xem livestream trên thiết bị thứ hai hoặc loa ngoài.

### 2.3. Trình duyệt / Mobile Web / PWA (Môi trường chạy trực tiếp)
- **Hỗ trợ thực tế:**
  - Thu âm Microphone trực tiếp qua `navigator.mediaDevices.getUserMedia` + `AudioContext` VAD + nhận diện giọng nói streaming qua `Web Speech API` (`SpeechRecognition` / `webkitSpeechRecognition`) cho `ko-KR`, `ja-JP`, `zh-CN`, `zh-TW`.
  - Chia sẻ âm thanh tab/màn hình qua `navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })` trên các trình duyệt hỗ trợ.
  - Phát mọi tệp video cục bộ (`.mp4`, `.webm`, `.mov`), đồng bộ phụ đề theo thời gian thực, hỗ trợ HTML5 Picture-in-Picture và nhập/xuất `.SRT`, `.VTT`, `.ASS`.

---

## 3. Sơ đồ 10 Module Hệ thống & Pipeline Bất đồng bộ

```
[Nguồn Âm thanh / Video / Tệp Phụ đề]
        │
        ▼
┌──────────────────────┐
│  1. Audio Engine     │ ──► Ring Buffer + RMS Meter + VAD + Noise Gate
└──────────┬───────────┘     (Phát hiện mất nguồn / âm lượng quá nhỏ)
           │ Audio Queue (Bounded, chống dồn ứ)
           ▼
┌──────────────────────┐
│ 2. Speech Recognition│ ──► Pluggable ASR Interface:
│    Engine (ASR)      │     • WebSpeechStreamingAdapter (Trình duyệt)
└──────────┬───────────┘     • CloudWhisperOrDeepgramAdapter (Backend WS/REST)
           │ Recognition Queue (Interim vs Final Segments)
           ▼
┌──────────────────────┐
│ 3. Translation       │ ──► Pluggable MT Interface + Context Memory (8 câu gần nhất)
│    Engine (AI MT)    │     + Personal Dictionary + Proper Noun Guard + 5 Style Modes
└──────────┬───────────┘     • CloudLLMTranslator (OpenAI / Gemini / DeepL qua Server)
           │                 • LocalContextualCJKEngine (Phân tích hình thái KR/JP/ZH)
           ▼
┌──────────────────────┐
│ 4. Subtitle Engine   │ ──► SubtitleStabilizer + Sync Offset (±5.0s) + 22 Style Props
└──────────┬───────────┘     + 8 Built-in Presets + Drag & Snap Layout Engine
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Presentation Layer (Home / Live / Video / Studio / Library)  │
└─────────────────────────────────────────────────────────────────┘
  ▲                ▲                 ▲                  ▲
  │                │                 │                  │
[6. Session Mgr] [7. Storage Layer] [8. Permission Mgr] [9. Network + 10. Diagnostics]
```

---

## 4. Chính sách Hàng đợi, Độ trễ & Bảo mật

1. **Quản lý hàng đợi có giới hạn (Bounded Async Queues):**
   - `audioQueue` (tối đa 12 đoạn), `recognitionQueue` (tối đa 8 tác vụ), `translationQueue` (tối đa 16 đoạn), `subtitleQueue` (hiển thị mượt theo timestamp).
   - Khi mạng yếu hoặc dịch vụ chậm: hợp nhất các đoạn tạm thời (coalesce interim chunks), ưu tiên đoạn đang phát mới nhất nhưng **không bao giờ xóa các câu đã xác nhận (`confirmed`)** khỏi transcript.
2. **Quản lý bộ nhớ ngữ cảnh (Bounded Context Window):**
   - Giữ tối đa `MAX_CONTEXT_TURNS = 8` câu đã xác nhận gần nhất + bảng thực thể tên riêng/đại từ rút gọn để phiên dịch kéo dài nhiều giờ không bị phình bộ nhớ RAM hay vượt giới hạn token.
3. **Bảo mật & Quyền riêng tư theo thiết kế (Privacy by Design):**
   - Không nhúng API key ở client.
   - Không ghi nội dung transcript cá nhân ra console/server log công khai.
   - Mặc định **không lưu bản ghi âm thô**; ngay khi nhấn *Kết thúc phiên*, mọi `MediaStreamTrack`, `AudioContext` và tiến trình nghe được đóng ngay lập tức (`track.stop()`).
