# Kho Thép Bãi

Ứng dụng web (PWA) quản lý tồn kho thép bê tông cốt thép D8 → D36 trên bãi, chạy hoàn toàn trên Cloudflare (gói miễn phí): **Workers + D1 + Static Assets**. Không cần VPS.

## Cách hệ thống tính

- Mỗi ô **(ngày × khu × phi)** là đơn vị gốc. Mọi thống kê (toàn bãi, theo khu, theo phi) tính từ các ô này.
- Hằng ngày mỗi khu báo số đếm thực tế (bó + cây lẻ). Phi không có ở khu thì không hỏi, hệ thống hiểu là 0.
- **Đã dùng = Tồn chuẩn hôm qua + Nhập trong ngày − Tổng đếm hôm nay** (tính ở cấp toàn bãi, không ai phải nhập phiếu xuất).
- Admin duyệt theo ngoại lệ: khu chưa báo, hai người báo khác số, phi dùng âm hoặc dùng quá 3 lần mức bình thường. Ngày bình thường chỉ cần một lần bấm xác nhận.
- Chốt ngày thì khóa số liệu, số đếm hôm đó trở thành **tồn chuẩn** cho ngày sau.
- Nhật ký hoạt động và lịch sử đếm chỉ ghi thêm (database từ chối sửa/xóa).

Vai trò: **Admin** (tất cả), **Thủ kho** (đếm + nhập kho), **Người đếm** (đếm + xem).

---

## Deploy lên Cloudflare (làm một lần, khoảng 15 phút)

**Cần có:** tài khoản Cloudflare miễn phí (https://dash.cloudflare.com/sign-up) và Node.js 20 trở lên (https://nodejs.org).

Mở Terminal (Windows: PowerShell) trong thư mục dự án này rồi chạy lần lượt:

### 1. Cài công cụ
```
npm install
npx wrangler login
```
Trình duyệt mở ra, bấm **Allow** để cho phép.

### 2. Tạo cơ sở dữ liệu D1
```
npx wrangler d1 create kho-thep
```
Lệnh in ra một đoạn có dòng `database_id = "xxxxxxxx-xxxx-..."`. Mở file **wrangler.toml**, thay `THAY_BANG_DATABASE_ID` bằng chuỗi đó.

### 3. Tạo bảng và dữ liệu mặc định
```
npx wrangler d1 execute kho-thep --remote --file=schema.sql
```
(Có hỏi xác nhận thì gõ `y`.)

### 4. Deploy
```
npx wrangler deploy
```
Cuối lệnh có địa chỉ dạng `https://kho-thep.<ten-cua-ban>.workers.dev`. Đó là địa chỉ ứng dụng.

### 5. Đặt hai bí mật (bắt buộc)
Tạo hai chuỗi ngẫu nhiên:
```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Chạy lệnh này **hai lần**, ghi lại hai chuỗi. Sau đó:
```
npx wrangler secret put PEPPER
npx wrangler secret put SETUP_TOKEN
```
Mỗi lệnh sẽ hỏi giá trị, dán một chuỗi vào rồi Enter (PEPPER là chuỗi thứ nhất, SETUP_TOKEN là chuỗi thứ hai).

> **PEPPER** dùng để băm PIN. Hãy lưu nó ở nơi an toàn. **Nếu mất hoặc đổi PEPPER, mọi PIN sẽ không dùng được nữa** (phải đặt lại PIN cho từng người).

### 6. Tạo admin đầu tiên
Mở `https://kho-thep.<ten-cua-ban>.workers.dev/setup`, nhập SETUP_TOKEN, tên, số điện thoại, PIN 4 số. Trang này chỉ dùng được một lần, có admin rồi hệ thống tự từ chối.

### 7. Thiết lập ban đầu trong ứng dụng
Đăng nhập admin, vào **Thêm**:
1. **Cài đặt**: đổi tên khu, thêm/ẩn khu theo bãi thực tế (mặc định có Khu A → H). Với từng phi, đặt **số cây mỗi bó**, **mức tồn tối thiểu** và **kg/cây** (mặc định theo 0,00617 × D² × 11,7 m, sửa theo trọng lượng thực tế nhà máy nếu khác).
2. **Người dùng và PIN**: tạo tài khoản cho thủ kho và các tổ. Hệ thống tạo PIN ngẫu nhiên hiện **một lần**, đưa cho người dùng. Họ phải tự đổi PIN khi đăng nhập lần đầu.
3. Ngày đầu tiên: các khu đếm và báo hết, admin vào **Duyệt → Chốt ngày**. Số đếm hôm đó trở thành tồn chuẩn đầu tiên, từ ngày sau hệ thống tính lượng dùng.

### 8. Cài lên điện thoại
- **Android (Chrome):** mở địa chỉ → menu ⋮ → **Thêm vào Màn hình chính** (hoặc **Cài đặt ứng dụng**).
- **iPhone (Safari):** mở địa chỉ → nút Chia sẻ → **Thêm vào Màn hình chính**.

---

## Việc thường làm

| Việc | Lệnh / cách làm |
|---|---|
| Cập nhật code sau khi sửa | `npx wrangler deploy` |
| Sao lưu dữ liệu ra file | `npx wrangler d1 export kho-thep --remote --output=backup.sql` |
| Khôi phục về thời điểm cũ | Cloudflare Dashboard → Storage & Databases → D1 → kho-thep → **Time Travel** (khôi phục theo từng phút, thời hạn lưu tùy gói, xem trang giá D1 của Cloudflare) |
| Xem lỗi trực tiếp | `npx wrangler tail` |
| Gắn tên miền riêng | Dashboard → Workers & Pages → kho-thep → Settings → **Domains & Routes** |
| Quên PIN | Admin vào **Người dùng và PIN → Đặt lại PIN** |
| Mất điện thoại | Admin **Khóa** tài khoản hoặc **Đăng xuất máy**, thiết bị bị đăng xuất ngay |

Nên sao lưu `backup.sql` định kỳ (ví dụ mỗi tuần) và cất ngoài Cloudflare.

## Chạy thử trên máy (không ảnh hưởng dữ liệu thật)
```
copy .dev.vars.example .dev.vars        (Mac/Linux: cp .dev.vars.example .dev.vars)
npm run db:local
npm run dev
```
Mở http://localhost:8787/setup để tạo admin thử.

## Hạn mức gói miễn phí (50 người dùng vẫn đủ)

| Hạng mục | Miễn phí | Ứng dụng này dùng |
|---|---|---|
| Workers | 100.000 yêu cầu/ngày | Khoảng vài chục nghìn nếu 50 người mở app cả ngày (máy chỉ hỏi số phiên bản mỗi 45 giây, chỉ tải lại khi có thay đổi) |
| D1 đọc | 5 triệu dòng/ngày | Dưới 1 triệu |
| D1 ghi | 100.000 dòng/ngày | Vài trăm đến vài nghìn |
| D1 dung lượng | 5 GB | Rất nhỏ |
| Giao diện tĩnh | Không giới hạn | |

Nếu sau này vượt hạn mức, gói Workers Paid 5 USD/tháng gỡ các giới hạn này, không cần sửa code.

## Bảo mật đã có
- PIN băm kèm PEPPER, không lưu PIN thật. Sai 5 lần khóa 15 phút. Cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
- Quyền kiểm tra ở server cho từng thao tác, không chỉ ẩn nút trên giao diện.
- Chặn gửi yêu cầu từ trang web lạ (kiểm tra Origin).
- Mọi thao tác ghi vào nhật ký (ai, làm gì, số cũ → số mới, lúc nào).

## Chưa có trong bản 1.0
- Ảnh phiếu nhập (cần thêm Cloudflare R2).
- Thông báo đẩy và nhắc tự động khi khu chưa báo (cần Cloudflare Cron + Web Push).
- Báo cáo nhập-xuất-tồn theo kỳ dạng Excel đầy đủ (hiện có xuất bảng khu × phi và thống kê lượng dùng theo ngày).

## Cấu trúc thư mục
```
wrangler.toml        cấu hình Cloudflare (nhớ điền database_id)
schema.sql           cấu trúc database + dữ liệu mặc định
src/worker.js        toàn bộ API
public/              giao diện: index.html, app.js, style.css, sw.js, manifest, biểu tượng, setup.html
```

## Gỡ lỗi nhanh
- *"Chưa cấu hình PEPPER"*: chưa chạy bước 5.
- *"Mã thiết lập sai"*: SETUP_TOKEN nhập không khớp với giá trị đã đặt.
- *Đăng nhập báo sai dù đúng PIN sau khi đổi PEPPER*: PEPPER đã bị đổi, cần đặt lại PIN từng người.
- *Lỗi khi chạy `d1 execute --remote`*: kiểm tra `database_id` trong wrangler.toml đã đúng chưa.
- *Giao diện không cập nhật sau khi deploy*: đóng hẳn app rồi mở lại (service worker lấy bản mới từ mạng).
