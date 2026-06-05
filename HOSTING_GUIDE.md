# 🚀 Hướng dẫn Host ứng dụng lên Render (Miễn phí)

## 📋 Bước 1: Chuẩn bị trên máy

### 1.1 Khởi tạo Git repository
Nếu chưa có git, mở terminal tại thư mục project và chạy:
```bash
git init
git add .
git commit -m "Initial commit"
```

### 1.2 Tạo tài khoản GitHub
1. Vào https://github.com
2. Đăng ký tài khoản (nếu chưa có)
3. Sau khi đăng ký xong, đăng nhập

---

## 🔗 Bước 2: Push code lên GitHub

### 2.1 Tạo repository mới trên GitHub
1. Vào https://github.com/new
2. Điền tên repo: `shipping-app` (hoặc tên khác tùy ý)
3. Chọn **Public** 
4. Click **Create repository**

### 2.2 Push code lên
Chạy các lệnh này (thay `USERNAME` bằng tên GitHub của bạn):
```bash
git remote add origin https://github.com/USERNAME/shipping-app.git
git branch -M main
git push -u origin main
```

---

## 🌐 Bước 3: Deploy lên Render

### 3.1 Tạo tài khoản Render
1. Vào https://render.com
2. Click **Sign up**
3. Chọn **Sign up with GitHub** (dễ nhất)
4. Cho phép Render truy cập GitHub account

### 3.2 Tạo Web Service mới
1. Sau khi đăng nhập Render, click **New +**
2. Chọn **Web Service**
3. Kết nối với repo GitHub của bạn:
   - Click **Connect** bên cạnh repository
   - Chọn repo `shipping-app`
   - Click **Connect**

### 3.3 Cấu hình Deploy
Điền các thông tin sau:

| Trường | Giá trị |
|-------|--------|
| **Name** | shipping-app |
| **Environment** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Region** | Singapore (gần Việt Nam) |
| **Plan** | Free |

### 3.4 Deploy
1. Scroll xuống, click **Create Web Service**
2. Đợi khoảng 2-3 phút để build và deploy
3. Khi thấy dòng xanh "Your service is live", quá trình hoàn tất ✅

---

## 📍 Bước 4: Truy cập ứng dụng

Sau khi deploy xong, bạn sẽ thấy URL kiểu:
```
https://shipping-app-xxxxx.onrender.com
```

Dán URL này vào trình duyệt để sử dụng ứng dụng!

---

## 🔄 Bước 5: Cập nhật ứng dụng

Mỗi lần bạn thay đổi code:
```bash
git add .
git commit -m "Update description"
git push
```

Render sẽ **tự động** deploy lại trong vòng 2-3 phút ✨

---

## ⚠️ Lưu ý quan trọng

### Về Database (SQLite)
- ✅ Hoạt động bình thường
- ⚠️ **Dữ liệu sẽ xóa khi Render restart**
- 💡 **Giải pháp**: Nếu cần lưu dữ liệu lâu dài, upgrade lên **PostgreSQL** (có free tier)

### Về Hiệu suất
- Free tier trên Render sẽ sleep sau 15 phút không dùng
- Lần truy cập đầu tiên sẽ chậm 30-40 giây (wake up)
- Lần truy cập sau sẽ nhanh bình thường

### Giới hạn
- 750 giờ/tháng (khoảng 1 máy chạy 24/7 suốt tháng)
- Miễn phí mãi miễn là bạn dùng

---

## 🆘 Nếu có lỗi

Kiểm tra logs trên Render:
1. Vào **Logs** tab trên trang Web Service
2. Tìm dòng lỗi (thường màu đỏ)
3. Copy lỗi và Google hoặc hỏi AI

**Lỗi phổ biến:**
- "Cannot find module" → Chạy `npm install` trên máy rồi push lại
- "Port already in use" → Code đã được fix, push lại
- "Build failed" → Kiểm tra lại package.json, có thể cú pháp sai

---

## 📊 Kiểm tra trạng thái

- 🟢 **Live** = Đang chạy bình thường
- 🔵 **Building** = Đang deploy
- 🔴 **Failed** = Có lỗi, xem logs

---

## ✅ Hoàn tất!

Bây giờ bạn có một ứng dụng hosting trên cloud, miễn phí, không cần chạy máy cá nhân!

Chia sẻ URL với ai cũng được truy cập được 🎉

---

**Cần giúp?** Hỏi lại và gửi screenshot logs nếu có lỗi.
