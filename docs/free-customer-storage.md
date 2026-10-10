# Lưu khách hàng trên Render Free

Khách hàng lưu trong database Turso bên ngoài Render. Restart, ngủ hoặc deploy Render không xóa database đó. Google Sheet, cache mã vận đơn và cách tính tiền không thay đổi.

1. Tạo tài khoản tại https://turso.tech và chọn **Free**, không bật trả phí/overages.
2. Tạo database `shipping-customers`. Lấy Database URL và tạo Auth Token có quyền đọc/ghi.
3. Trong Render → service `shipping-app` → **Environment**, thêm đồng thời:
   - `TURSO_DATABASE_URL=libsql://...turso.io`
   - `TURSO_AUTH_TOKEN=...`
4. Không đưa token vào Git hoặc chat. Save và deploy phiên bản hỗ trợ Turso.
5. Kiểm tra `/health`: `customerStorage` phải là `turso`. Chỉ có URL hoặc chỉ có token sẽ chặn khởi động; kết nối Turso lỗi sẽ báo lỗi, không lưu nhầm sang SQLite tạm.
6. Chuyển khách hàng hiện tại trước khi tạo khách hàng mới. Sao lưu bằng API `/api/customers` vào file riêng ngoài repository. Khi database đích còn trống và app đã tạo bảng, chạy cục bộ với hai biến Turso trong môi trường:

   `node scripts/import-customers.js <đường-dẫn-backup.json>`

   Công cụ dùng transaction, giữ ID, mã, mức tối thiểu, đơn giá, ngày tạo và ngày cập nhật. Nếu database đích đã có khách hàng, dừng để tránh ghi đè. Nếu không có quyền chạy công cụ, có thể nhập lại các khách hàng từ bản sao lưu qua giao diện; ngày tạo sẽ là thời điểm nhập lại.
7. Tạo khách hàng, thử sửa, kiểm tra lại sau restart/deploy Render. Chỉ xác nhận chuyển đổi hoàn tất khi dữ liệu vẫn còn và `/health` báo `turso`.

Khi hết hạn token hoặc vượt hạn mức Free, API báo lỗi cần xử lý tài khoản Turso; không tự đổi sang nơi lưu tạm. Dữ liệu khách hàng và token không được commit. Không xóa database Turso đang dùng.

Không cấu hình hai biến trên: app giữ SQLite cũ để chạy cục bộ; chưa giải quyết được lưu lâu dài trên Render Free.
