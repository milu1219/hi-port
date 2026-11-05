# ⚡ Port Killer - Windows DevPort Manager (Chrome Extension + Native Messaging)

> **Giải phóng tức thì các cổng mạng (ports) bị kẹt trên Windows (3000, 5173, 8080, 5432,...) trực tiếp từ trình duyệt Chrome / Brave / Edge.**

---

## 🏛️ Kiến trúc kỹ thuật (Architecture)

Vì Chrome Extension chạy trong môi trường **Sandbox** bảo mật của trình duyệt, nó không có quyền trực tiếp can thiệp vào hệ thống hoặc thực thi lệnh Command Prompt / PowerShell của Windows.

Hệ thống được thiết kế theo mô hình **Chrome Native Messaging (Manifest V3)**:

```
┌──────────────────────────────────────────────┐
│        Chrome Browser / Extension            │
│  React (Vite) Popup UI                       │
│  chrome.runtime.sendNativeMessage(...)       │
└──────────────────────┬───────────────────────┘
                       │ JSON qua Stdin/Stdout
                       │ (4-byte length prefix)
┌──────────────────────▼───────────────────────┐
│     Windows Native Messaging Host            │
│  - host\run_host.bat -> host\host.js (Node) │
│  - netstat -ano | findstr :<PORT>            │
│  - tasklist /FI "PID eq <PID>"               │
│  - taskkill /PID <PID> /F /T                 │
└──────────────────────────────────────────────┘
```

---

## 📂 Cấu trúc thư mục

```
portkiller/
├── extension/                     # Chrome Extension (Manifest V3 + React + Vite)
│   ├── manifest.json              # Khai báo permissions: ["nativeMessaging"]
│   ├── index.html                 # Entry point của Popup UI
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   ├── manifest.json          # Bundle sang dist
│   │   └── icons/                 # Icon kích thước 16, 48, 128
│   └── src/
│       ├── App.jsx                # Component giao diện chính
│       ├── App.css                # Dark mode styling cho popup
│       └── main.jsx
├── host/                          # Native Messaging Host (Node.js)
│   ├── host.js                    # Đọc Stdin binary, xử lý netstat & taskkill
│   ├── run_host.bat               # Batch file khởi chạy Node host cho Chrome
│   ├── com.portkiller.host.json   # Manifest cấu hình Native Host
│   └── host.log                   # Log tự động ghi lại quá trình thực thi
├── scripts/                       # Scripts cài đặt Registry Windows
│   ├── install_host.bat           # Tự động cấu hình Registry cho Chrome/Brave/Edge
│   ├── uninstall_host.bat         # Gỡ bỏ Registry keys
│   └── register_template.reg      # Mẫu file .reg thủ công
└── README.md
```

---

## 🚀 Hướng dẫn cài đặt & Sử dụng (3 Bước)

### Bước 1: Build Extension Frontend
Mở terminal tại thư mục `extension` và build giao diện:
```bash
cd extension
npm install
npm run build
```
Thư mục `extension/dist` sẽ được tạo ra với đầy đủ `manifest.json`, file HTML, CSS và JS đã đóng gói.

---

### Bước 2: Cài Extension vào Chrome / Brave
1. Mở trình duyệt Chrome hoặc Brave và truy cập:
   - Chrome: `chrome://extensions`
   - Brave: `brave://extensions`
2. Bật công tắc **"Developer mode"** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm nút **"Load unpacked"** (Tải tiện ích đã giải nén).
4. Chọn thư mục `c:\Users\hi\Desktop\tool\portkiller\extension\dist` (hoặc thư mục `extension` nếu chạy dev).
5. Sau khi load thành công, sao chép chuỗi **Extension ID** (gồm 32 ký tự, ví dụ: `abcdefghijklmnop...`).

---

### Bước 3: Đăng ký Native Messaging Host vào Windows Registry
1. Chạy file `scripts\install_host.bat` (nhấp đúp hoặc chạy qua CMD/PowerShell).
2. Khi được hỏi, hãy **dán Extension ID** bạn vừa copy ở Bước 2 và nhấn **Enter**.
3. Script sẽ tự động:
   - Tạo file `host\com.portkiller.host.json` với đường dẫn tuyệt đối đến `run_host.bat`.
   - Đăng ký Registry key cho **Google Chrome**, **Brave Browser** và **Microsoft Edge**:
     - `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.portkiller.host`
     - `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.portkiller.host`
     - `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.portkiller.host`

---

## ⚡ Sử dụng Extension

1. Nhấp vào icon **Port Killer** trên thanh tiện ích của Chrome.
2. Kiểm tra trạng thái: Huy hiệu góc trên sẽ hiển thị **"Host Ready"** (màu xanh lá).
3. **Giải phóng nhanh (Preset Ports)**:
   - `3000`: React / Next.js / NestJS
   - `5173`: Vite / Vue / Svelte
   - `8080`: Java / Spring Boot / Tomcat
   - `5432`: PostgreSQL
   - `3306`: MySQL / MariaDB
   - `8000`: Python / Django / FastAPI
   - Bấm **"Check"** để xem tiến trình nào đang chiếm cổng.
   - Bấm **"Kill"** để đóng ngay tiến trình.
4. **Giải phóng Custom Port**:
   - Nhập bất kỳ số cổng nào (ví dụ: `4000`, `9000`) và bấm **"Kill Port"** hoặc nhấn phím **Enter**.
5. Xem nhật ký chi tiết (PID, tên tiến trình như `node.exe`, `java.exe`) ở khung **Nhật ký hoạt động**.
6. **🎮 Chế độ Game (Game Mode Cleaner)**:
   - Chuyển sang tab **"🎮 Chế độ Game"**.
   - Xem thống kê các server dev đang chạy ngầm (`node.exe`, `python.exe`, `java.exe`, `docker`, `postgres`...).
   - Bấm **"🚀 TẮT HẾT DEV SERVER"** để giải phóng tức thì toàn bộ tiến trình ngốn RAM & CPU trước khi chơi game.
   - Tự động bảo vệ các tiến trình hệ thống cốt lõi (`System`, `svchost.exe`, `explorer.exe`, `dwm.exe`...).

---

## 🛠️ Nguyên lý xử lý trên Windows (`host.js`)

1. **Giao thức Native Messaging**:
   - Chrome trao đổi qua luồng nhị phân `stdin` và `stdout`.
   - Mỗi thông điệp JSON được mở đầu bằng 4 bytes số nguyên không dấu (Uint32 Little-Endian) chỉ định độ dài byte của chuỗi JSON.
   - File `host.js` tích lũy Buffer từ `process.stdin`, cắt đúng độ dài và parse JSON an toàn.

2. **Tìm kiếm tiến trình chiếm port**:
   - Thực thi lệnh: `netstat -ano | findstr :<PORT>`
   - Phân tích cột Local Address kết thúc bằng `:<PORT>` (ngăn chặn tình trạng nhầm lẫn giữa port 3000 với 30000 hoặc client socket).
   - Lấy PID ở cột cuối cùng.
   - Tra cứu tên tiến trình bằng: `tasklist /FI "PID eq <PID>" /FO CSV /NH` (nhận diện `node.exe`, `postgres.exe`,...).

3. **Buộc dừng tiến trình**:
   - Thực thi lệnh: `taskkill /PID <PID> /F /T`
     - `/F`: Buộc dừng (Force).
     - `/T`: Dừng cả cây tiến trình con (Tree) — đặc biệt quan trọng với `npm run dev` vì npm khởi tạo process node con.

