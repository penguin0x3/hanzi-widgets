# Hướng dẫn cài đặt

Học tiếng Trung mà không cần mở app: từ mới và bộ thủ tự hiện trên iPhone.

- **Màn hình khóa:** mỗi lần hiện 1 từ (chữ Hán, pinyin, nghĩa tiếng Việt), lấy từ khoảng 970 từ.
- **Màn hình chính:** 1 trong 50 bộ thủ hay gặp, kèm 3 chữ ví dụ. Khoảng 10 phút đổi một lần.

Tổng thời gian cài: khoảng 5 phút.

## Bước 1. Cài Scriptable

Tải app **Scriptable** (miễn phí) trên App Store. Mở app lên một lần rồi thoát ra.

## Bước 2. Tải 4 file

Vào thư mục [`scriptable/`](scriptable/) và tải 4 file:

- `Hourly Words.js`
- `Radicals.js`
- `words.txt`
- `radicals.txt`

Cách tải từng file trên iPhone: bấm vào tên file, bấm nút **Download raw file** (mũi tên xuống, góc phải), rồi chọn **Lưu vào Tệp (Save to Files)**.

Khi lưu, chọn đúng thư mục: **iCloud Drive > Scriptable**. Đây là bước quan trọng nhất. Lưu sai chỗ thì widget báo lỗi "Missing words.txt".

## Bước 3. Kiểm tra

Mở Scriptable. Bạn sẽ thấy 2 script `Hourly Words` và `Radicals`. Bấm vào từng cái để chạy thử:

- `Radicals` hiện một ô bộ thủ mẫu.
- `Hourly Words` không hiện gì là bình thường. Nó chỉ chạy trong widget.

## Bước 4. Thêm widget màn hình khóa (từ vựng)

1. Mở khóa máy, giữ ngón tay trên màn hình khóa, bấm **Tùy chỉnh (Customize)** rồi chọn **Màn hình khóa**.
2. Bấm vào ô widget dưới đồng hồ, chọn **Scriptable**, chọn ô **hình chữ nhật**.
3. Bấm vào widget vừa thêm. Ở mục **Script**, chọn `Hourly Words`.

## Bước 5. Thêm widget màn hình chính (bộ thủ)

1. Giữ ngón tay trên màn hình chính, bấm **Sửa (Edit)** rồi **Thêm tiện ích (Add Widget)**.
2. Tìm **Scriptable**, chọn cỡ **vừa (medium)**, rồi thêm vào màn hình.
3. Giữ ngón tay trên widget, chọn **Sửa tiện ích**. Ở mục **Script**, chọn `Radicals`.

## Câu hỏi hay gặp

**Bao lâu thì đổi từ?** iOS tự quyết thời gian làm mới widget, thường từ 5 đến 30 phút. Máy càng ít dùng thì đổi càng chậm.

**Báo lỗi "Missing words.txt" hoặc "Missing radicals.txt"?** File `.txt` chưa nằm trong iCloud Drive > Scriptable. Mở app Tệp, kéo file vào đúng thư mục đó.

**Muốn thêm từ của mình?** Mở `words.txt` trong app Tệp và thêm một dòng theo dạng `chữ Hán | pinyin | nghĩa`, ví dụ `学生 | xuéshēng | học sinh`.

**Có bản cho Mac không?** Có, nhưng phải tự build bằng Terminal. Xem phần "Mac setup" trong [README.md](README.md).
