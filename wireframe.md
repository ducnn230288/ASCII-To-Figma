Dưới đây là **wireframe ASCII cho trang Đăng nhập**, bám theo bố cục ảnh đã tải lên nhưng chuẩn hóa thành phần, màu sắc, typography và spacing theo `design-system.md`. Design System quy định **Noto Sans JP**, hệ màu `Base / Primary`, nền ứng dụng `Base 50`, Navy `Base 950`, CTA vàng `Primary 500`, input/card theo lưới spacing Tailwind và typography chuẩn Tailwind CSS v4. Đặc tả màn hình Đăng nhập cũng xác định đây là màn hình 01, route `#/:lang/auth/login`, dành cho khách chưa đăng nhập và dùng bố cục nhận diện thương hiệu + form đăng nhập.

### Wireframe ASCII — Desktop 1536 × 1024

```text
┌──────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┐
│                                                      │                                                               │
│  KHỐI THƯƠNG HIỆU / BRAND PANEL                     │                  KHU VỰC ĐĂNG NHẬP                            │
│  ~46% chiều rộng                                     │                  ~54% chiều rộng                             │
│  Base 950 + ảnh nền phủ Navy                         │                  Background: Base 50                         │
│                                                      │                                                               │
│                                                      │        ┌─────────────────────────────────────────────┐        │
│  ┌───────────────────────────────────────┐           │        │                                             │        │
│  │ [MARK]  FRESHNESS                    │           │        │                           [Ngôn ngữ  v]     │        │
│  │         CAMPER                       │           │        │                                             │        │
│  └───────────────────────────────────────┘           │        │                                             │        │
│                                                      │        │                 ĐĂNG NHẬP                   │        │
│                                                      │        │      Vui lòng đăng nhập để tiếp tục         │        │
│  NÂNG TẦM TRẢI NGHIỆM,                              │        │             sử dụng hệ thống               │        │
│  ĐỒNG HÀNH CÙNG TỰ DO.                              │        │                                             │        │
│                                                      │        │                                             │        │
│  ━━━━━                                               │        │  Tên đăng nhập hoặc Email                  │        │
│                                                      │        │  ┌───────────────────────────────────────┐  │        │
│  Hệ thống quản trị nội dung chính thức              │        │  │ [User] Nhập tên đăng nhập hoặc email │  │        │
│  của Freshness Camper Việt Nam                      │        │  └───────────────────────────────────────┘  │        │
│                                                      │        │                                             │        │
│                                                      │        │  Mật khẩu                                  │        │
│  [Shield]  BẢO MẬT CAO CẤP                          │        │  ┌───────────────────────────────────────┐  │        │
│            Dữ liệu được bảo vệ theo                  │        │  │ [Lock] Nhập mật khẩu            [Eye] │  │        │
│            tiêu chuẩn doanh nghiệp                  │        │  └───────────────────────────────────────┘  │        │
│                                                      │        │                                             │        │
│  [Users]   QUẢN TRỊ TẬP TRUNG                        │        │  [✓] Ghi nhớ đăng nhập      Quên mật khẩu? │        │
│            Quản lý nội dung, sản phẩm                │        │                                             │        │
│            và cấu hình website                      │        │  ┌───────────────────────────────────────┐  │        │
│                                                      │        │  │              ĐĂNG NHẬP               │  │        │
│  [Chart]   ỔN ĐỊNH & TIN CẬY                        │        │  └───────────────────────────────────────┘  │        │
│            Hệ thống vận hành ổn định,                │        │       Primary 500 / full width             │        │
│            hiệu suất tối ưu                         │        │                                             │        │
│                                                      │        │  ───────────── hoặc đăng nhập với ─────── │        │
│                                                      │        │                                             │        │
│                                                      │        │  ┌───────────────────────────────────────┐  │        │
│                                                      │        │  │ [G]       Đăng nhập với Google       │  │        │
│                                                      │        │  └───────────────────────────────────────┘  │        │
│                                                      │        │                                             │        │
│                                                      │        │  ┌───────────────────────────────────────┐  │        │
│                                                      │        │  │ [Shield] Vì lý do bảo mật, vui lòng  │  │        │
│                                                      │        │  │ đăng xuất sau khi sử dụng thiết bị   │  │        │
│                                                      │        │  │ dùng chung.                           │  │        │
│                                                      │        │  └───────────────────────────────────────┘  │        │
│                                                      │        │                                             │        │
│                                                      │        └─────────────────────────────────────────────┘        │
│                                                      │                                                               │
│                                                      │                                                               │
│  © 2026 Freshness Camper Việt Nam                   │            [Headphones] Cần hỗ trợ đăng nhập?                │
│  All rights reserved.                               │            support@freshnesscamper.vn                        │
│                                                      │            [Phone] 024 7100 6699                            │
│  Chính sách bảo mật   |   Điều khoản sử dụng        │                                                               │
│                                                      │                                                               │
└──────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────────┘
```

### Cấu trúc và kích thước đề xuất

```text
Viewport chuẩn
1536 × 1024 px

┌────────────────────────── 46% ≈ 706 px ──────────────────────────┐
│ BRAND PANEL                                                     │
└──────────────────────────────────────────────────────────────────┘
┌────────────────────────── 54% ≈ 830 px ──────────────────────────┐
│ AUTH AREA                                                       │
│                                                                 │
│      Login Card                                                 │
│      width: khoảng 650–680 px                                   │
│      min-height: khoảng 800–830 px                              │
│      padding: 56–64 px                                          │
│      radius: 8–10 px                                            │
│      border: Base 200                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phân cấp form theo Design System

```text
ĐĂNG NHẬP
text-3xl / 30px / 36px
font-bold
Base 950

Mô tả
text-sm / 14px / 20px
Base 500

Label
text-sm / 14px / 20px
font-semibold
Base 800

Input
height: 44 px
border: Base 200
radius: 6–8 px
placeholder: Base 400
icon: Base 400
focus: Primary 500

Nút Đăng nhập
height: 44 px
background: Primary 500
hover: Primary 600
pressed: Primary 700
text: white
font-medium / semibold

Nút Google
height: 44 px
background: white
border: Base 200
text: Base 800

Security notice
background: Warning 50
border: Warning 200
icon: Warning 500
text: Base 600
```

### Trạng thái tương tác cần có

```text
DEFAULT
┌────────────────────────────────────────┐
│ [User] Nhập tên đăng nhập hoặc email  │
└────────────────────────────────────────┘

FOCUS
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [User] admin@freshnesscamper.vn       ┃  ← Primary focus
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

VALIDATION ERROR
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ [User] admin@                         ┃  ← Error border
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
  Email hoặc tên đăng nhập không hợp lệ.

PASSWORD
┌────────────────────────────────────────┐
│ [Lock] •••••••••••••••          [Eye] │
└────────────────────────────────────────┘

SUBMITTING
┌────────────────────────────────────────┐
│          [Spinner] ĐANG ĐĂNG NHẬP     │
└────────────────────────────────────────┘

LOGIN ERROR
┌────────────────────────────────────────┐
│ [!] Không thể đăng nhập.               │
│     Vui lòng kiểm tra thông tin.       │
│     Mã yêu cầu: REQ-XXXXXXXX           │
└────────────────────────────────────────┘

RATE LIMITED
┌────────────────────────────────────────┐
│ [!] Bạn đã thử đăng nhập quá nhiều lần.│
│     Vui lòng thử lại sau 42 giây.      │
└────────────────────────────────────────┘
```

Bố cục này ưu tiên **hình học của ảnh tham chiếu** — brand panel lớn bên trái, card đăng nhập độc lập bên phải, language selector ở góc card, hỗ trợ phía dưới — đồng thời thay các giá trị trình bày không còn phù hợp trong đặc tả login cũ bằng token và typography của `design-system.md`, đặc biệt là **Noto Sans JP + Primary/Base tokens**.
