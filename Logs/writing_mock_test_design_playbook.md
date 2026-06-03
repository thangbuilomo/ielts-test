# Writing Mock Test Design Playbook

Tai lieu nay tom tat kinh nghiem tu trang `Writing Mock Test 01` de lan sau tao cac mock test Writing moi nhanh hon, dong bo hon va it bi roi cau truc.

## 1. Nguyen tac san pham

Trang Writing mock test nen uu tien cam giac lam bai that, khong phai landing page. Man hinh dau tien la overlay bat dau bai test, sau do vao ngay giao dien lam bai.

Nhung muc tieu chinh:

- Hoc vien vao bai nhanh, nhung phai hieu ro quy dinh.
- Giao dien gan voi format IELTS/IDP: de bai ben trai, bai viet ben phai.
- Timer, word count va submit phai ro rang.
- Anti-cheat can ro nhung khong qua gay hoang mang.
- Du lieu gui ve sheet can du de giao vien cham, audit va doi chieu vi pham.

## 2. Cau truc thu muc nen dung

Mau hien tai:

```text
saola-tests-static/
  index.html
  mock/
    index.html
    writing/
      index.html
      test-01/
        index.html
        test.json
  assets/
    css/
      saola-base.css
      writing-test.css
    js/
      writing-test.js
    images/
      ducthangbui-logo-rect.png
```

Khi tao test moi:

```text
mock/writing/test-02/
  index.html
  test.json
```

Nen copy `test-01` roi thay:

- `data-test-id`
- title
- Task 1 prompt/chart/image
- Task 2 prompt
- metadata trong `test.json`

## 3. Overlay bat dau bai

Overlay nen co 2 cot ngang:

- Cot trai: logo, ten bai, mo ta ngan, anti-cheat song ngu, quy dinh.
- Cot phai: dang nhap hoc vien, email, mat khau, Guest Mode.

Kinh nghiem UI:

- Khong nen bold qua nhieu. Chi bold heading, label, nut chinh.
- Quy dinh nen viet ngan, scan duoc.
- Anti-cheat nen song ngu Viet/Anh vi co hoc sinh yeu tieng Anh.
- Guest Mode phai noi ro: lam duoc nhung khong gui ket qua ve giao vien.
- Logo dung file trong folder `Logos`, copy vao `assets/images`.

Thong diep nen co:

- Hoc vien co the lam Guest Mode nhung ket qua khong duoc ghi lai.
- Chi hoc vien co trang thai `Dang hoc`/`Đang học` moi duoc luu ket qua.
- Neu sai thong tin: "Vui long kiem tra lai thong tin hoac lien he giao vien de nhan tai khoan va mat khau."

## 4. Layout lam bai

Layout tot nhat hien tai:

- Header tren cung: logo, trang thai, save status, violation count, timer, submit.
- Ben trai: prompt/de bai.
- O giua: thanh keo chinh be ngang.
- Ben phai: textarea viet bai.

Nen co split pane keo ngang vi de Writing co khi can xem hinh lon hon hoac viet rong hon.

Quy tac:

- Thanh keo gioi han khoang 34% den 66% de khong lam panel nao qua nho.
- Tren man hinh nho thi bo thanh keo, chuyen ve mot cot.
- Prompt panel khong nen co scroll qua nhieu neu chi la mot image/chart.
- Visual Task 1 nen gioi han `max-height` theo viewport.

## 5. Format Part 1 va Part 2

Part 1 can co:

```text
Part 1
You should spend about 20 minutes on this task. Write at least 150 words.

[Task prompt]

Summarise the information by selecting and reporting the main features, and make comparisons where relevant.
```

Part 2 can co:

```text
Part 2
You should spend about 40 minutes on this task. Write at least 250 words.

Write about the following topic:

[Essay question]

Give reasons for your answer and include any relevant examples from your own knowledge or experience.
```

Task 1:

- Neu de co anh/chart: can uu tien hien vua viewport.
- Neu anh qua cao: scale theo chieu cao, khong de hoc vien phai keo len keo xuong lien tuc.
- Neu dung image that, nen dat trong `assets/images/tests/writing/test-xx/`.
- Neu dung chart bang CSS/HTML, phai dam bao label ro, khong qua nho.

Task 2:

- De bai nen nam thanh block van ban gon, khong can card phuc tap.
- Cau hoi chinh nen bold vua phai, khong qua to.

## 6. Font va visual style

Font hien tai: Roboto.

Ly do:

- Hien dai hon Segoe/Arial mac dinh.
- De doc voi giao dien test.
- Hop voi UI IELTS mock test.

Style nen giu:

- Nen trang/sang.
- Border nhe, it shadow.
- Nut chinh mau brand.
- Khong dung gradient/orb/hero marketing.
- Khong lam card long nhau qua nhieu.

## 7. Timer va am thanh

Timer hien tai:

- Tong thoi gian: 60 phut.
- Moc 20 phut: dong ho nhap nhay va beep.
- Moc 40 phut: canh bao con 20 phut.
- Moc 55 phut: canh bao con 5 phut.
- Het 60 phut: auto submit.

Am thanh het gio:

- Dang dung YouTube ID `Qt02LiZdEAg`.
- Luu y: YouTube/autoplay co the bi browser chan.
- Nen thay bang file mp3 local khi chay that de on dinh hon.

## 8. Anti-cheat UX

Event dang ghi:

- Thoat fullscreen / fullscreen exit.
- Doi tab / tab switch.
- Mat focus cua so / window blur.
- Paste bi chan / paste blocked.
- Copy/cut bi chan.
- Click chuot phai.
- Dong/tai lai trang.

Khi hoc sinh vi pham:

- Hien modal giua man hinh.
- Blur nen.
- Noi dung song ngu Viet/Anh.
- Hoc sinh bam xac nhan moi tiep tuc lam.

Neu du 5 vi pham:

- Auto submit.
- Submit reason phai ghi ro:

```text
Tu dong nop bai do vi pham noi quy 5 lan
```

Khong nen chi hien toast nho o goc man hinh, vi hoc sinh co the khong thay.

## 9. Submit va receipt

Sau khi nop bai, receipt chi nen hien thong tin hoc sinh can biet:

- Ma de.
- Ho ten.
- Email.
- Ly do nop bai.
- Word count Task 1.
- Word count Task 2.
- So lan vi pham.

Khong hien:

- Attempt ID.
- Google Sheet status.
- Payload ky thuat.

Nut `Back to Writing test` nen tro ve `index.html` cua chinh test de reload overlay ban dau. Khong dung `../` khi chay local bang `file://` vi se bi hien directory listing.

## 10. Payload va Google Sheet

Payload bai nop nen co:

- `type`: `writing_submit`
- `test_id`
- `test_code`
- `attempt_id`
- `student_name`
- `email`
- `started_at`
- `submitted_at`
- `duration_seconds`
- `submit_reason`
- `submit_reason_label`
- `task1_text`
- `task2_text`
- `task1_word_count`
- `task2_word_count`
- `violation_count`
- `violation_summary`
- `anti_cheat_events`
- `user_agent`
- `screen_size`

Sheet `Writing_Answer` nen co it nhat:

- Email hoc vien
- Ho va ten
- Task 1
- Task 2
- Ma de
- Ly do nop bai
- Attempt ID

Sheet `Cheat_Writing` nen co:

- Email hoc vien
- Ho va ten
- Loai cheat
- Ngay vi pham
- Gio vi pham
- Ma bai test
- Attempt ID
- So giay tu luc bat dau
- Tong so vi pham
- Chi tiet
- User agent
- Screen size
- Event ID

## 11. Attempt ID va Ma de

Ma de:

- La `test_id/test_code`.
- Vi du: `writing_mock_test_01`.
- Can hien trong receipt va ghi vao `Writing_Answer`.

Attempt ID:

- La ma duy nhat cua mot luot lam bai.
- Vi du: `wmock_20260602123456_ab12cd`.
- Khong phai ma de.
- Khong hien cho hoc sinh.
- Dung de noi bai nop voi cheat log va tranh ghi trung.

## 12. Chong spam va bao mat

MVP hien tai:

- Student login bang `Student_List`.
- Guest Mode khong ghi sheet.
- GAS moi co `auth_token`.
- Dedupe submit bang Attempt ID.

Can luu y:

- Neu chua redeploy GAS moi, frontend co fallback gui password thuong de tuong thich ban cu.
- Khi deploy GAS moi on dinh, nen bo fallback password thuong.
- Khong day folder `google-apps-script` len GitHub public neu trong do co secret.

Khi len VPS/LMS:

- Dung backend that thay GAS public endpoint.
- Luu password hash, khong luu plain text.
- Co session/token server-side.
- Rate limit theo IP/email.
- Co attempt lock: mot hoc vien khong spam tao qua nhieu attempt trong thoi gian ngan.

## 13. Checklist tao Writing mock test moi

1. Copy folder `mock/writing/test-01` thanh `test-xx`.
2. Doi `data-test-id` trong HTML.
3. Doi `test_id`, `title`, prompt trong `test.json`.
4. Doi Task 1:
   - Neu la anh: them image vao assets va dung CSS max-height viewport.
   - Neu la chart HTML/CSS: check label, mau, kich thuoc.
5. Doi Task 2 prompt.
6. Kiem tra Part 1/Part 2 instruction.
7. Test Guest Mode.
8. Test login hoc vien.
9. Test word count.
10. Test submit thu cong.
11. Test auto submit het gio.
12. Test auto submit do 5 vi pham.
13. Kiem tra Google Sheet co ghi bai va cheat log.
14. Push len GitHub.
15. Hard refresh GitHub Pages va test lai URL public.

## 14. Quy tac deploy GitHub Pages

Repo hien tai:

`https://github.com/thangbuilomo/ielts-test`

Sau khi push:

- Vao GitHub repo.
- `Settings > Pages`.
- Source: `Deploy from a branch`.
- Branch: `main`.
- Folder: `/root`.
- Save.

URL du kien:

`https://thangbuilomo.github.io/ielts-test/`

Writing test:

`https://thangbuilomo.github.io/ielts-test/mock/writing/test-01/`

## 15. Quy tac ghi log

Moi lan sua lon nen cap nhat file trong `Logs/`:

- Them ngay sua.
- Ghi da sua UI/logic/GAS gi.
- Ghi viec con dang do.
- Ghi test nao da kiem tra.
- Ghi ro neu co dieu can redeploy GAS/GitHub Pages.

