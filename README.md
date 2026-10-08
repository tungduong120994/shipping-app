# Google Sheets Reader Web App

Ứng dụng web đơn giản để đọc dữ liệu từ Google Sheets công khai.

## Cách Sử Dụng

1. Đảm bảo Google Sheet của bạn được đặt công khai (chia sẻ với "Bất kỳ ai có liên kết").
2. Sao chép ID của sheet từ URL (phần giữa `/d/` và `/edit`).
3. Chạy server: `npm start`
4. Mở trình duyệt và truy cập `http://localhost:3000`
5. Nhập ID của sheet và nhấn "Tải Dữ Liệu"

## Cài Đặt

1. Cài đặt Node.js nếu chưa có.
2. Chạy `npm install` để cài đặt dependencies.

## Lưu Ý

- Chỉ hoạt động với các sheet công khai.
- Dữ liệu được tải dưới dạng CSV và hiển thị dưới dạng bảng.

## Quy tắc nghiệp vụ được giữ nguyên

- Mã trong ngoặc được lấy ra; hậu tố sau dấu `-` bị bỏ; mã nhập trùng được gộp.
- Cùng một dòng, mỗi mã chuẩn hóa chỉ tính một lần.
- Mã chỉ có trong một sheet: cộng mọi lần xuất hiện. Có trong nhiều sheet: lấy lần đầu của mỗi sheet.
- Cân tính phí làm tròn lên 0,1 kg. Tiền mỗi mã là `max(cân tính phí × đơn giá, tiền tối thiểu)`.
- Đơn giá lớn hơn 0 và nhỏ hơn 1000 vẫn được hiểu là nghìn VNĐ theo cách nhập cũ (50 = 50.000đ/kg).
- `minLevel` là tiền tối thiểu bằng VNĐ; bản sửa chỉ đổi nhãn hiển thị, không chuyển đổi dữ liệu cũ.

## Kiểm tra và vận hành

- Cài bằng `npm ci`, chạy kiểm tra bằng `npm test`, khởi động bằng `npm start`. Node.js 20 trở lên.
- Nạp toàn bộ tab và lập chỉ mục mã vận đơn khi server khởi động. Tra cứu từ chỉ mục trong RAM, không tải lại CSV cho từng mã.
- Tự cập nhật nền mỗi 5 phút, tải tối đa 4 yêu cầu cùng lúc, timeout mỗi yêu cầu 15 giây. Nút **Cập nhật dữ liệu** tải lại ngay.
- Hiển thị số tab và thời điểm dữ liệu cập nhật. Khi cập nhật nền lỗi, bản cache trước vẫn dùng tối đa 15 phút với thông báo; quá hạn thì chặn tra cứu tới khi tải thành công.
- Cache RAM mất khi server restart; lượt đầu cần chờ nạp dữ liệu. `SHEET_CACHE_WARMUP=0` chỉ dùng để tắt nạp trước khi kiểm thử; `SHEET_ID` chọn file nạp trước (mặc định file đang dùng).
- Sheet tải lỗi sẽ chặn kết quả toàn bộ lượt tra cứu, tránh lập phiếu từ dữ liệu chưa đầy đủ.
- `/health` trả trạng thái database và commit đang chạy (`RENDER_GIT_COMMIT`).
- `DATABASE_PATH`: đường dẫn SQLite. Mặc định vẫn dùng `customers.db` cũ.
- Trên Render, chỉ dùng đường dẫn persistent disk đã được cấu hình khi cần giữ dữ liệu qua deploy. Đổi biến môi trường không tự di chuyển database; sao lưu và chép database cũ trước khi đổi đường dẫn.
- `APP_USERNAME` và `APP_PASSWORD`: cấu hình cả hai để bật đăng nhập Basic cho giao diện/API qua HTTPS. Để trống cả hai giữ cách truy cập cũ. Không ghi mật khẩu vào Git.
- File `.xls` vẫn dùng định dạng HTML tương thích Excel theo cách xuất cũ.
