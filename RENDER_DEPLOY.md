# 📦 Deploy Lên Render - Hướng dẫn Chi tiết

**Status:** ✅ Code đã push lên GitHub  
**Repo:** https://github.com/tungduong120994/shipping-app

Bây giờ chỉ cần deploy lên Render (15 phút)

---

## 🎯 Bước 1: Tạo Render Account

1. Vào https://render.com
2. Click **Sign up** (góc trên phải)
3. Chọn **Sign up with GitHub** (dễ nhất)
4. Click **Authorize render** khi GitHub hỏi
5. Hoàn thành đăng ký Render

---

## 🎯 Bước 2: Tạo Web Service

1. Sau khi đăng nhập Render, click **New +** (menu trái)
   
   ![Screenshot: Click New button](https://render.com/images/docs/deploy-service.png)

2. Chọn **Web Service**

3. Chọn repository **tungduong120994/shipping-app**

   *(Nếu không thấy, click "Connect your GitHub account")*

4. Click **Connect**

---

## 🎯 Bước 3: Cấu hình Build & Deploy

**Điền các thông tin CHÍNH XÁC sau:**

| Trường | Giá trị |
|-------|--------|
| **Name** | `shipping-app` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Region** | `Singapore (apr)` |
| **Plan** | `Free` |

---

## 🎯 Bước 4: Deploy

1. Scroll xuống dưới cùng
2. Click **Create Web Service**
3. **Đợi 2-3 phút** để build
4. Khi thấy **✓ Your service is live** = Xong! ✅

---

## 🎯 Bước 5: Truy cập Ứng dụng

Render sẽ tạo URL tự động:

```
https://shipping-app-XXXXX.onrender.com
```

**Copy URL này vào trình duyệt → Ứng dụng của bạn đã chạy! 🎊**

---

## 📍 Nếu có lỗi

### ❌ Build Failed?
1. Vào tab **Logs** trên trang Render
2. Scroll tìm dòng lỗi (đỏ)
3. Kiểm tra:
   - `package.json` - Syntax đúng không?
   - `server.js` - Có lỗi không?

### ❌ "Connect your GitHub"?
Render cần permission để đọc repo:
1. Click nút đó
2. Select `shipping-app`
3. Click **Install & Authorize**

### ❌ Ứng dụng load chậm lần đầu?
Bình thường! Free tier sẽ sleep, lần truy cập đầu mất 30-40 giây.

---

## 🔄 Cập nhật Code Sau Này

Mỗi lần bạn thay đổi code:

```powershell
cd d:\source\new
git add .
git commit -m "Thay đổi gì đó"
git push
```

Render sẽ **tự động deploy lại** trong 2-3 phút! 🚀

---

## ✅ Hoàn tất!

Chúc mừng! Ứng dụng giờ đã chạy trên cloud, **miễn phí, 24/7**:

- 🌐 **URL:** https://shipping-app-XXXXX.onrender.com
- 💾 **Database:** SQLite (lưu trên Render)
- 🔄 **Auto-deploy:** Mỗi lần push GitHub
- 📊 **Logs:** Xem trên trang Render

**Chia sẻ URL với đồng nghiệp để dùng chung!** 👥

---

Cần giúp gì, hỏi lại nhé! 😊
