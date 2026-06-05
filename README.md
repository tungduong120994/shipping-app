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