# Writing Mock Test 01 - Project Log

Ngay hien tai module dang lam la trang IELTS Writing Mock Test 01 trong folder:

`H:/Codex/VolDesignTest/saola-tests-static/mock/writing/test-01/`

Trang nay du kien duoc day len GitHub repo:

`https://github.com/thangbuilomo/ielts-test`

## Muc tieu MVP

Lam mot trang Writing mock test co the chay bang GitHub Pages, cho hoc vien dang nhap bang email/mat khau, lam bai 60 phut, ghi bai lam va anti-cheat log ve Google Sheet thong qua GAS Web App.

## Cau truc static site

- `index.html`: trang chon module test.
- `mock/index.html`: danh sach mock test.
- `mock/writing/index.html`: danh sach Writing mock test.
- `mock/writing/test-01/index.html`: trang lam bai Writing Mock Test 01.
- `mock/writing/test-01/test.json`: metadata cua bai test.
- `assets/css/saola-base.css`: style base dung chung.
- `assets/css/writing-test.css`: style rieng cho trang Writing.
- `assets/js/writing-test.js`: logic timer, auth, autosave, submit, anti-cheat.
- `assets/images/ducthangbui-logo-rect.png`: logo dung trong overlay va header bai test.

Khong day folder `google-apps-script/` len GitHub public vi trong do co code backend/GAS va token secret.

## Giao dien hien tai

- Font chinh: Roboto.
- Overlay vao bai test co 2 cot ngang:
  - Cot trai: logo, ten bai, mo ta, canh bao anti-cheat song ngu, quy dinh lam bai.
  - Cot phai: dang nhap hoc vien, email, mat khau, Guest Mode.
- Trang lam bai co split pane keo ngang bang thanh resize o giua man hinh.
- Ben trai la de bai, ben phai la textarea tra loi.
- Part 1/Part 2 hien theo format IELTS:
  - Part 1: "You should spend about 20 minutes..." va "Write at least 150 words."
  - Part 2: "You should spend about 40 minutes..." va "Write at least 250 words."
- Phan chart Task 1 duoc gioi han theo chieu cao viewport de hoc vien it phai keo phan de bai.
- Receipt sau submit khong hien Attempt ID va khong hien thong tin Google Sheet.
- Receipt hien Ma de, ho ten, email, ly do nop bai, word count va so lan vi pham.

## Chuc nang hien co

- Bat buoc dang nhap neu muon luu ket qua vao Google Sheet.
- Guest Mode cho phep lam thu, khong ghi bai lam hoac cheat log vao sheet.
- Timer 60 phut.
- Den moc 20 phut dong ho nhap nhay va co beep.
- Den moc 40 phut va 55 phut co canh bao thoi gian.
- Het 60 phut tu dong nop bai.
- Khi het gio co nhung am thanh YouTube ID `Qt02LiZdEAg`. Luu y autoplay cua YouTube co the bi trinh duyet chan, sau nay nen thay bang file mp3 local.
- Autosave localStorage tren trinh duyet trong luc lam bai.
- Word count rieng Task 1 va Task 2.
- Submit thu cong co modal xac nhan.

## Anti-cheat hien co

He thong ghi nhan cac event:

- `FULLSCREEN_EXIT`: thoat fullscreen.
- `TAB_SWITCH`: doi tab hoac roi trang.
- `WINDOW_BLUR`: cua so bai thi mat focus.
- `PASTE_BLOCKED`: paste noi dung.
- `COPY_BLOCKED`: copy noi dung.
- `CUT_BLOCKED`: cut noi dung.
- `RIGHT_CLICK_BLOCKED`: click chuot phai.
- `PAGE_UNLOAD`: dong/tai lai trang trong luc lam bai.

Khi bi vi pham, trang hien modal giua man hinh, blur nen, noi dung song ngu Viet/Anh. Hoc vien bam "Toi da hieu, tiep tuc lam bai" de tiep tuc.

Neu du 5 vi pham, he thong tu dong nop bai. Ly do nop bai trong payload:

`Tu dong nop bai do vi pham noi quy 5 lan`

## Auth va Google Sheet

Frontend dang goi GAS Web App URL trong `data-gas-url` cua HTML.

Deploy 2 hien tai:

`https://script.google.com/macros/s/AKfycbz6mSuAhOl6yIEfuYYLPUvi4LAjTOTwA0t3ik5MBi515I7twRBsWNLR-2apjRwqQgPbFw/exec`

Sheet can co cac tab:

- `Student_List`
- `Writing_Answer`
- `Cheat_Writing`

`Student_List` dang duoc doc nhu sau:

- Cot A: ho ten hoc vien neu co.
- Cot B: email.
- Cot F: tinh trang, can la `Dang hoc` hoac `Đang học`.
- Cot G: mat khau.

GAS moi trong local co ho tro:

- `password_hash` SHA-256.
- Legacy fallback password cho deployment cu.
- `auth_token` sau khi dang nhap thanh cong.
- Dedupe bai nop bang Attempt ID.
- Ghi them `Ma de`, `Ly do nop bai`, `Attempt ID` vao `Writing_Answer`.

Can redeploy GAS moi de bat `auth_token` va cac cot moi. Khi health dung ban moi, response phai co `version`.

## Attempt ID la gi

Attempt ID khong phai ma de. Day la ma duy nhat cho mot lan lam bai, vi du `wmock_20260602123456_ab12cd`.

Dung de:

- Noi bai nop voi cheat log.
- Tranh ghi trung khi request submit bi gui lai.
- Audit noi bo neu hoc vien khieu nai.

Attempt ID khong hien cho hoc sinh, chi luu trong Google Sheet.

Ma de hien tai la:

`writing_mock_test_01`

## Chong spam

Hien tai co cac lop giam spam:

- Chi hoc vien trong `Student_List` moi duoc luu ket qua.
- Guest Mode khong ghi sheet.
- GAS moi co auth token va validate token khi nhan bai nop/log.
- Dedupe bang Attempt ID.

Can lam tiep khi len VPS/LMS:

- Session server-side.
- Rate limit theo user/IP.
- Hash password trong database, khong luu password plain text.
- CSRF/token rieng cho tung attempt.
- Captcha nhe neu login bi spam.

## Viec vua sua gan nhat

- Doi logo overlay va header test sang file trong folder `Logos`.
- Giam bold text tren overlay.
- Them anti-cheat song ngu Viet/Anh.
- Doi link receipt "Back to Writing test" ve `index.html` de reload lai overlay ban dau, khong nhay ra directory listing.
- Them split pane keo ngang.
- Them ma de vao receipt va payload.
- An Attempt ID khoi giao dien hoc sinh.

## Viec can lam tiep

1. Redeploy Apps Script ban moi trong `saola-tests-static/google-apps-script/writing_test_receiver.gs`.
2. Kiem tra health endpoint co `version`.
3. Kiem tra dang nhap bang hoc vien that.
4. Kiem tra submit thu cong, auto submit do het gio, auto submit do 5 vi pham.
5. Kiem tra `Writing_Answer` co cot `Ma de`, `Ly do nop bai`, `Attempt ID`.
6. Thay YouTube end sound bang file mp3 local neu can dam bao phat am thanh 100%.
7. Sau khi push GitHub, bat GitHub Pages cho repo `thangbuilomo/ielts-test`.
