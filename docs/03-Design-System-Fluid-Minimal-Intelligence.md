# LINGUA FLOW — Hệ thống Thiết kế "Fluid Minimal Intelligence"

## 1. Triết lý thẩm mỹ

**Fluid Minimal Intelligence** kết hợp độ trực quan tinh gọn của hệ sinh thái di động cao cấp với sự tập trung thị giác của các trình chiếu điện ảnh:
- **Cao cấp nhưng gần gũi:** Nền sáng ngà ấm (`#F7F7F4`) làm mặc định ban ngày giúp đọc chữ lâu không chói; chế độ tối Obsidian (`#0B0E14`) được cân chỉnh độ tương phản bề mặt riêng cho môi trường xem phim/livestream thiếu sáng.
- **Phân cấp thị giác rõ ràng:** Mỗi màn hình chỉ có một vùng hành động chính nổi bật. Các tùy chỉnh chuyên sâu nằm gọn trong Bottom Sheet hoặc bảng mở rộng.
- **Thao tác một tay (One-Handed Ergonomics):** Mọi vùng chạm chính đạt tối thiểu `44×44px`–`52px`, đặt ở nửa dưới màn hình, tách biệt hoàn toàn các hành động nhạy cảm (*Kết thúc phiên*, *Xóa lịch sử*) khỏi các nút chỉnh cỡ chữ hay tạm dừng.

---

## 2. Hệ thống Màu sắc (Design Tokens)

| Token | Light Mode (Mặc định) | Dark Mode (Xem đêm) | Mục đích sử dụng |
|---|---|---|---|
| `--bg-canvas` | `#F7F7F4` | `#0B0E14` | Nền chính toàn ứng dụng |
| `--bg-surface` | `#FFFFFF` | `#141923` | Khối chức năng chính, thẻ nội dung |
| `--bg-elevated` | `#EFECE6` | `#1D2432` | Thanh công cụ phụ, ô nhập liệu, phân vùng |
| `--text-primary` | `#12151C` | `#F3F5F8` | Tiêu đề, văn bản chính |
| `--text-secondary` | `#525B6C` | `#9BA5B7` | Nhãn phụ, thời gian, mô tả ngắn |
| `--accent-primary` | `#2E5BFF` | `#5B82FF` | Điểm nhấn thương hiệu (Electric Cobalt) |
| `--accent-flow` | `#0D9488` | `#2DD4BF` | Trạng thái dòng chảy âm thanh / đồng bộ (Teal) |
| `--status-success` | `#15803D` | `#4ADE80` | Hoàn tất, đã lưu, kết nối ổn định |
| `--status-warning` | `#B45309` | `#FBBF24` | Âm thanh nhỏ, độ tin cậy thấp, mạng chậm |
| `--status-danger` | `#DC2626` | `#F87171` | Lỗi mất nguồn, ngừng khẩn cấp, xóa dữ liệu |

*Quy tắc sử dụng:* Gradient thương hiệu (`linear-gradient(135deg, #2E5BFF 0%, #0D9488 100%)`) chỉ xuất hiện có chủ đích tại biểu trưng thương hiệu, nút khởi chạy chính và hiệu ứng sóng trạng thái đang dịch — tuyệt đối không lạm dụng trên các thẻ thông thường.

---

## 3. Typography đa ngôn ngữ

- **Giao diện & Tiếng Việt:** `Be Vietnam Pro`, `Inter`, system-ui — tối ưu dấu thanh kết hợp (`ấ, ể, ợ, ữ`) không bị cắt dấu khi đặt `line-height` từ `1.35` trở lên.
- **Hiển thị CJK (Hàn / Nhật / Trung):** Chuỗi fallback chuẩn hóa cho từng mã ngôn ngữ (`lang="ko"`, `lang="ja"`, `lang="zh-Hans"`, `lang="zh-Hant"`):
  - Hàn: `'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`
  - Nhật: `'Hiragino Sans', 'Noto Sans JP', sans-serif`
  - Trung Giản thể: `'PingFang SC', 'Noto Sans SC', sans-serif`
  - Trung Phồn thể: `'PingFang TC', 'Noto Sans TC', sans-serif`
- **Thang chữ phụ đề:** Từ `13px` đến `42px`, tự động tính toán lại chiều cao khung và xuống dòng mềm (soft-wrap) để không bao giờ tràn hoặc cắt chữ trên màn hình nhỏ.

---

## 4. Nhận diện thương hiệu & Hệ thống Icon

- **Logo LINGUA FLOW:** Biểu trưng hình học kết hợp **ba làn sóng âm thanh hội tụ thành hai dòng phụ đề cân đối** trong khung bo góc mềm (`squircle`), biểu đạt dòng chảy chuyển ngữ thời gian thực mà không phụ thuộc vào hình lá cờ quốc gia — sẵn sàng mở rộng sang nhiều ngôn ngữ mới.
- **Hệ Icon:** Đường nét đồng nhất `stroke-width: 1.85px`, đầu nét tròn (`round cap/join`), dễ nhận diện ngay ở kích thước `18px–24px`.

---

## 5. Danh mục 28 Component chuẩn hóa

Toàn bộ thành phần trong `src/components/ui/` và `src/components/subtitle/` hỗ trợ đầy đủ 5 trạng thái (`normal`, `selected`, `pressed`, `disabled`, `loading`) và nhãn trợ năng (`aria-label`):
1. `PrimaryButton` / 2. `SecondaryButton` / 3. `IconButton` / 4. `FloatingActionPill`
5. `BottomNavBar` / 6. `BottomSheet` / 7. `ConfirmModal` / 8. `ToastBanner` / 9. `InlineNotice`
10. `TextField` / 11. `SearchField` / 12. `SegmentedControl` / 13. `PrecisionSlider` / 14. `SwitchToggle` / 15. `SelectDropdown`
16. `LanguageSelector` / 17. `SubtitlePreviewStage` / 18. `DraggableSubtitleOverlay` / 19. `TranscriptSegmentRow`
20. `SessionStatusIndicator` (10 trạng thái chuyên biệt) / 21. `LiveWaveformBar` (phản ánh RMS thực) / 22. `SyncProgressBar`
23. `AudioSourceSelector` / 24. `SubtitlePresetCard` / 25. `SessionHistoryCard`
24. `PermissionExplainSheet` / 27. `EmptyStateCard` / 28. `ErrorRecoveryCard`
