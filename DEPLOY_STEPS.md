# 🚀 Hướng dẫn Deploy Lên Render - CHI TIẾT TỪNG BƯỚC

**Tình trạng:** Code đã được git init + commit xong. Bây giờ bạn cần làm 3 phần chính.

---

## ✅ PHẦN 1: Tạo GitHub Account & Repo (10 phút)

### Bước 1.1: Đăng ký GitHub
1. Vào https://github.com
2. Click **Sign up** (góc trên phải)
3. Điền:
   - Email: (email của bạn)
   - Password: (nhớ mật khẩu)
   - Username: (tên muốn dùng, ví dụ: `your-username`)
4. Hoàn thành verification

### Bước 1.2: Tạo Repository mới
1. Đăng nhập GitHub
2. Click **+** (góc trên phải) → **New repository**
3. Điền:
   - **Repository name**: `shipping-app`
   - **Description**: `Google Sheets shipping management app`
   - **Visibility**: `Public`
4. **Bỏ chọn** "Add a README file"
5. Click **Create repository**

### Bước 1.3: Lấy Git URL
Bạn sẽ thấy trang như này, copy URL dạng HTTPS:
```
https://github.com/YOUR_USERNAME/shipping-app.git
```

---

## ✅ PHẦN 2: Push Code Lên GitHub (5 phút)

Mở **PowerShell** tại `d:\source\new` và chạy:

```powershell
# Thay YOUR_USERNAME bằng username GitHub của bạn
git remote add origin https://github.com/YOUR_USERNAME/shipping-app.git
git branch -M main
git push -u origin main
```

**Khi chạy lệnh push:**
- Sẽ hiện pop-up yêu cầu đăng nhập GitHub
- Đăng nhập bằng credentials của bạn
- Code sẽ được upload lên GitHub

**Xác nhận:** Vào https://github.com/YOUR_USERNAME/shipping-app sẽ thấy code của bạn 🎉

---

## ✅ PHẦN 3: Deploy Lên Render (15 phút)

### Bước 3.1: Tạo Render Account
1. Vào https://render.com
2. Click **Sign up**
3. Chọn **Sign up with GitHub**
4. Cho phép Render truy cập GitHub account của bạn

### Bước 3.2: Tạo Web Service
1. Sau khi đăng nhập Render:
2. Click **New +** (menu trái) → **Web Service**
3. Kết nối với repo GitHub:
   - Nếu chưa link GitHub: Click **Connect your GitHub account**
   - Chọn repo `shipping-app`
   - Click **Connect**

### Bước 3.3: Cấu hình Deploy
Điền các trường như sau:

```
Name: shipping-app
Environment: Node
Build Command: npm install
Start Command: npm start
Region: Singapore
Plan: Free
```

### Bước 3.4: Deploy
1. Scroll xuống, click **Create Web Service**
2. Đợi 2-3 phút
3. Khi thấy dòng xanh **"Your service is live"**, quá trình hoàn tất ✅

### Bước 3.5: Lấy URL
Render sẽ tạo URL tự động:
```
https://shipping-app-xxxxx.onrender.com
```

**Vào URL này để dùng ứng dụng!** 🎊

---

## 📍 Lệnh Nhanh

**Thêm remote (thay YOUR_USERNAME):**
```powershell
git remote add origin https://github.com/YOUR_USERNAME/shipping-app.git
git branch -M main
git push -u origin main
```

**Cập nhật sau này (mỗi lần thay đổi code):**
```powershell
git add .
git commit -m "Update description"
git push
```

Render sẽ tự động deploy lại trong 2-3 phút!

---

## ⚠️ Lưu ý

| Vấn đề | Giải pháp |
|-------|----------|
| "Authentication failed" khi push | Bạn cần tạo Personal Access Token trên GitHub: Settings → Developer settings → Personal access tokens |
| "Build failed" trên Render | Kiểm tra logs, thường là package.json hoặc Node version |
| Web chạy nhưng database bị xóa khi restart | Đó là feature bình thường của SQLite, có thể upgrade PostgreSQL nếu cần |
| Wake up chậm (lần truy cập đầu) | Bình thường, free tier thế đó, lần sau sẽ nhanh |

---

## ✅ Checklist

- [ ] GitHub account tạo xong
- [ ] Repository `shipping-app` tạo xong
- [ ] Code push lên GitHub (`git push`)
- [ ] Render account tạo xong
- [ ] Web Service tạo trên Render
- [ ] URL sống (xanh "Your service is live")
- [ ] Truy cập URL được ứng dụng

---

**Bạn đã hoàn tất!** 🎉 Ứng dụng giờ đã chạy trên cloud, miễn phí, 24/7!

Hỏi lại nếu có lỗi.
