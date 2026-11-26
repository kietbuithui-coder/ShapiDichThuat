# LINGUA FLOW — Product Requirements Document (PRD)

**Phiên bản:** 1.0.0  
**Định vị sản phẩm:** Ứng dụng di động dịch thuật nội dung nghe nhìn (Video, Livestream, Âm thanh trực tiếp & Phụ đề) theo thời gian thực từ **Tiếng Hàn, Tiếng Nhật, Tiếng Trung (Giản thể & Phồn thể)** sang **Tiếng Việt**.

---

## 1. Tầm nhìn & Giá trị cốt lõi

LINGUA FLOW giúp người dùng Việt Nam hiểu ngay nội dung tiếng Hàn, tiếng Nhật và tiếng Trung trong lúc đang xem livestream, video hoặc nghe hội thoại trực tiếp mà không phải chụp màn hình, sao chép từng câu sang công cụ dịch rời rạc.

### Năm giá trị cốt lõi
1. **Dịch nhanh:** Pipeline bất đồng bộ theo từng đoạn (streaming/chunked recognition + incremental translation) giảm độ trễ cảm nhận và phân biệt trực quan giữa *phụ đề tạm thời* và *phụ đề đã xác nhận*.
2. **Dịch dễ hiểu theo ngữ cảnh:** Bộ nhớ ngữ cảnh trượt (sliding context window) giữ mạch đại từ nhân xưng, kính ngữ Hàn/Nhật, thành ngữ, tiếng lóng, từ điển cá nhân và bảo vệ tên riêng.
3. **Phụ đề đẹp & chuẩn điện ảnh:** 22 thuộc tính tùy chỉnh, 8 mẫu preset thẩm mỹ cao và kho lưu trữ preset cá nhân không giới hạn.
4. **Tùy biến kéo thả linh hoạt:** Trình chỉnh sửa trực quan **Subtitle Customization Studio** có lưới căn chỉnh (Snap Grid), vùng an toàn (Safe Area), tùy biến thanh công cụ và khôi phục 1 chạm.
5. **Trung thực kỹ thuật & Hoạt động thực tế:** Phân biệt minh bạch khả năng thực tế của Android, iOS và Mobile Web. Không dùng nút giả, không tuyên bố vượt rào DRM hoặc chính sách bảo mật hệ điều hành.

---

## 2. Nhóm người dùng mục tiêu

| Nhóm người dùng | Nhu cầu trọng tâm | Giải pháp trong LINGUA FLOW |
|---|---|---|
| **1. Người xem livestream nước ngoài** (Ưu tiên số 1) | Hiểu nhanh lời nói streamer/idol Hàn, Nhật, Trung; ít thao tác; không che khuất hình ảnh | Chế độ Livestream thời gian thực, phụ đề Live gọn nhẹ, Bảng điều khiển nhanh (`Aa`), Phụ đề nổi Android (`WindowManager`) hoặc chế độ Micro dự phòng |
| **2. Người xem video** | Xem video tải về, video chia sẻ, chương trình thực tế với phụ đề đồng bộ thời gian | Trình phát video tích hợp, tự đồng bộ theo `currentTime`, chỉnh độ trễ thủ công (`±5.0s`), tốc độ `0.5x–2.0x`, PiP, chế độ Tập trung |
| **3. Người học ngoại ngữ (KR/JP/ZH)** | Đối chiếu câu gốc & tiếng Việt, tra từ nhanh, lưu mẫu câu và thuật ngữ | Chế độ Song ngữ (tùy chỉnh tỷ lệ dòng), chạm từ để tra cứu phiên âm/nghĩa (Romaja, Furigana, Pinyin, Hán-Việt), Lưu câu & Từ điển cá nhân |
| **4. Người dùng phổ thông** | Mở ứng dụng là dùng được ngay, không phải hiểu thuật ngữ kỹ thuật (ASR, VAD, OCR) | Nhãn tiếng Việt tự nhiên (*Đang nghe, Đang nhận diện, Đang dịch, Đang đồng bộ*), Bắt đầu nhanh 1 chạm với cấu hình gần nhất |

---

## 3. Phạm vi ngôn ngữ & Kiến trúc mở rộng

- **Ngôn ngữ nguồn hỗ trợ chính thức:**
  - `ko` — Tiếng Hàn (xử lý kính ngữ `-요/-습니다`, thân mật 반말, tiểu từ, lược chủ ngữ, tên riêng idol/streamer).
  - `ja` — Tiếng Nhật (Hiragana, Katakana, Kanji; thể lịch sự `です/ます`, thể thông thường, hậu tố xưng hô `-さん/-ちゃん/-くん/-先輩`, câu lược chủ ngữ).
  - `zh-CN` — Tiếng Trung Giản thể (Đại lục / Singapore; thành ngữ, ngôn ngữ mạng livestream).
  - `zh-TW` — Tiếng Trung Phồn thể (Đài Loan / Hồng Kông; khác biệt từ vựng khu vực so với Giản thể).
  - `auto` — Tự động nhận diện ngôn ngữ nguồn với cơ chế chống nhảy ngôn ngữ (hysteresis) khi gặp từ mượn hoặc tên riêng tiếng Anh.
- **Ngôn ngữ đích mặc định:** `vi` — Tiếng Việt tự nhiên, chuẩn dấu câu, đúng đại từ xưng hô.
- **Khả năng mở rộng:** Quản lý qua `LanguageRegistry` (`src/core/languages/languageRegistry.ts`), cho phép bổ sung ngôn ngữ mới, bộ phân đoạn câu và nhà cung cấp ASR/MT mà không phải sửa kiến trúc UI.

---

## 4. Năm chế độ dịch cốt lõi

1. **Chế độ Dịch Livestream (`livestream`):** Luồng nghe liên tục (Tab/Screen Audio khi nền tảng cho phép, Android AudioPlaybackCapture, hoặc Micro), nhận diện từng phần, dịch ngữ cảnh, cập nhật phụ đề mượt và hỗ trợ cửa sổ nổi.
2. **Chế độ Dịch Video (`video`):** Trình phát nội bộ hỗ trợ tệp video từ máy, URL hợp lệ, trích xuất hoặc đính kèm phụ đề `.SRT/.VTT/.ASS`, nhận diện giọng nói cho video không có phụ đề, giữ đồng bộ khi tua và tạm dừng xử lý khi dừng video.
3. **Chế độ Nghe trực tiếp bằng Micro (`microphone`):** Hoạt động độc lập với nền tảng phát (xem livestream trên TV/PC/điện thoại khác), có biểu đồ sóng âm thực tế (RMS Waveform), chỉ báo thu âm minh bạch và ngắt micro tuyệt đối ngay khi dừng phiên.
4. **Chế độ Dịch phụ đề có sẵn (`subtitle-file`):** Nhập `.SRT`, `.VTT`, `.ASS`/`.SSA`, bảo toàn 100% mốc thời gian (`startTimestamp` → `endTimestamp`), dịch hàng loạt theo ngữ cảnh, cho phép sửa tay từng câu (phân biệt bản dịch AI và bản sửa tay) và xuất file mới.
5. **Chế độ Dịch nhanh một câu (`quick-translate`):** Bottom sheet gọn nhẹ để nói hoặc nhập nhanh một câu ngắn, nhận ngay bản dịch tiếng Việt + phân tích từ vựng + đọc mẫu (TTS).

---

## 5. Lộ trình phát hành & Quản trị rủi ro

### Phân kỳ tính năng
- **MVP (Đã triển khai đầy đủ trong bản hiện tại):** Trang chủ Fluid Minimal Intelligence, chọn ngôn ngữ KR/JP/ZH-CN/ZH-TW + Auto, dịch sang tiếng Việt (5 phong cách dịch), nhận diện bằng Micro thực tế + nguồn âm thanh luồng, trình phát Video tích hợp có đồng bộ thời gian & PiP, nhập/xuất `.SRT/.VTT/.ASS`, 22 thuộc tính phụ đề + 8 preset + kéo thả trực quan + Customize Studio Snap Grid, Song ngữ, Transcript tìm kiếm, Câu đã lưu, Từ điển cá nhân, Lịch sử local-first, Cài đặt 8 nhóm, Light/Dark Mode.
- **Native Platform Bridges (`native/android` & `native/ios`):** Module Kotlin cho Android (`AudioPlaybackCapture`, `WindowManager` Floating Subtitle, `ForegroundService` Notification) và module Swift cho iOS (`AVPictureInPictureController`, `ShareExtension`, `AVAudioSession`).
- **Giai đoạn mở rộng tiếp theo:** Đồng bộ đám mây đầu-cuối (E2EE optional sync), mô hình Whisper ONNX/CoreML/NNAPI lượng tử hóa chạy offline trên thiết bị flagship (≥ 8GB RAM).

### Danh sách rủi ro & Biện pháp giảm thiểu
| Rủi ro | Mức độ | Giải pháp kỹ thuật & UX |
|---|---|---|
| Ứng dụng nguồn chặn thu âm nội bộ (`allowAudioPlaybackCapture="false"` hoặc DRM) | Cao | Phát hiện ngay khi luồng âm thanh rỗng, hiển thị thông báo tiếng Việt rõ ràng và chuyển 1 chạm sang chế độ Nghe bằng Micro |
| iOS không cho phép vẽ cửa sổ phụ đề nổi đè lên mọi ứng dụng bên thứ ba | Cao | Không hiển thị nút giả trên iOS; cung cấp Trình phát tích hợp + PiP + Share Sheet + chế độ Micro |
| Phụ đề tạm thời nhảy chữ liên tục gây mỏi mắt | Trung bình | Bộ ổn định `SubtitleStabilizer`: tách vùng hiển thị câu đã xác nhận và dòng nhận diện tạm thời, khóa chiều cao tối thiểu và chống cập nhật dưới ngưỡng 180ms |
| Lộ khóa API bí mật trong client di động | Nghiêm trọng | Tuyệt đối không nhúng API key vào client; mọi kết nối Cloud AI đi qua Backend Proxy (`server/`) với phiên ngắn hạn |
