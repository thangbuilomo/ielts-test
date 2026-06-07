# Mock Reading/Listening Playbook - 2026-06-07

Muc dich: ghi lai giao dien, tinh nang va cau truc JSON cua mock Reading/Listening de lan sau tao test moi hoac cho AI khac tiep tuc dung dung pattern hien tai.

## 1. Pham vi hien tai

- Runner Reading: `mock/reading/test-runner.html`, `mock/reading/test-runner.js`.
- Runner Listening: `mock/listening/test-runner.html`, `mock/listening/test-runner.js`.
- CSS chung: `mock/assets/css/test-engine.css`.
- Du lieu Listening: `mock/listening/data/TEST_1` den `TEST_8`.
- Du lieu Reading: `mock/reading/data/TEST_x`.
- Ten hien thi trong runner: `Saola IELTS Actual Exam Vault 9 - Test 01`, `Test 02`, ...

## 2. Nguyen tac giao dien

- Trang test la man hinh lam bai that, khong phai landing page.
- Font chung dung Roboto.
- Header can gon: logo Saola ben trai, tieu de test, timer, nut help `?`, nut nop bai.
- Logo Saola bam duoc ve trang Mock Test.
- Overlay truoc khi vao bai phai hien thi du huong dan trong mot man hinh, han che scroll.
- Giao dien uu tien doc de, nghe audio va nhap cau tra loi; tranh lap lai tung cau thanh card dai neu cau tra loi da nam ngay trong note/table/flow-chart.

## 3. Tinh nang chung Reading va Listening

- Highlight: nguoi dung boi den text, click chuot phai de chon mau highlight.
- Review: click so cau o thanh cau hoi de danh dau xem lai.
- Nut `?` can mo lai huong dan Highlight va Review trong luc lam bai.
- Answer sync: neu mot cau co input inline trong prompt va input ben duoi, hai o phai dong bo 2 chieu.
- Cac input inline nen co nhan cau hoi ro rang bang placeholder hoac badge/label gan o trong o.

## 4. Reading runner

- Layout chia 2 cot:
  - Ben trai: reading passage.
  - Ben phai: question groups.
- Ben trai co control tang/giam co chu passage de hoc sinh tuy chinh luong text nhin thay.
- Question panel dung font nho gon hon passage de tiet kiem dien tich.
- Footer question navigator khong duoc de len dong cuoi cua passage/question; can chua padding-bottom cho vung scroll.
- Table trong Reading can co border ro, hang/cot de nhin giong bang that.
- Dang completion trong table/summary/note nen render input ngay tai cho trong prompt.

## 5. Listening runner

- Khi bat dau bai Listening, audio tu dong chay.
- Player chi hien thi thoi gian/timeline can thiet; an nut play/pause/stop de giong dieu kien thi.
- Timeline audio nam tren header, gan khu vuc timer/help de tiet kiem dien tich cau hoi.
- Listening khong render 40 cau tren cung mot trang. Phai tach thanh 4 parts:
  - Footer ben trai: nut Part 1, Part 2, Part 3, Part 4.
  - Footer ben phai: trang thai 40 cau hoi.
- Chi giu nut nop bai o header, khong hien nut hoan thanh/nop bai o duoi tung section.
- Note/table/flow-chart/map/label completion phai cho nhap/dung dropdown ngay trong khu vuc de bai.
- Tapescript khong in dam dap an hoac tu khoa dap an.

## 6. JSON question schema

Moi `questions.json` dung schema co ban:

```json
{
  "schema_version": "saola.questions.v1",
  "test_id": "vol_09_t1_ls",
  "module": "listening",
  "question_count": 40,
  "question_groups": []
}
```

Moi `question_group` nen co:

```json
{
  "group_id": "ls_t1_p1_g1",
  "part_id": "l1",
  "passage_id": "p1",
  "question_range": [1, 10],
  "question_type": "sentence_completion",
  "skill_tags": ["ls_detail"],
  "instruction": "Complete the sentences below...",
  "prompt_html": "<p>...</p>",
  "items": []
}
```

Luu y:

- Listening dung `part_id`: `l1`, `l2`, `l3`, `l4`.
- Reading dung `passage_id`: `p1`, `p2`, `p3`.
- `instruction` la cau lenh ngan gon.
- `prompt_html` la layout de thi: note/table/flow-chart/map/summary. Day la phan quan trong nhat de renderer hien thi dep.
- `items` phai du so cau trong `question_range`.
- Moi item nen co `question_id`, `number`, `prompt_html`, `response_type`.
- Neu la text completion, dung `response_type: "text"`.
- Neu la dropdown/letter choice, dung options A-K, A-I... va can de renderer nhan dien qua instruction/prompt/options.
- Neu la MCQ/TFNG, de options trong group hoac item tuy pattern san co.

## 7. Renderer rules quan trong

- Renderer co the dua vao `question_type`, nhung khong nen chi phu thuoc vao no.
- Can doc ca `instruction`, `prompt_html`, `items`, `options` de quyet dinh cach render.
- Table/note/flow-chart co input inline: renderer chen control vao dung vi tri cau so.
- Neu source JSON da co input inline o prompt, phai sync voi answer model chung.
- Neu source JSON chi co item rieng le, renderer van tao input ben duoi nhu fallback.
- Cac ky tu placeholder loi nhu gach duoi qua dai, ky tu la, hoac noi dung intro bi lap thuong la loi tu file JSON/source ban dau. Sau khi sua JSON dung, runner se render theo JSON moi.

## 8. Khi them test moi

Checklist:

- Tao folder `mock/listening/data/TEST_XX` hoac `mock/reading/data/TEST_XX`.
- Can co `manifest.json`, `content.json`, `questions.json`.
- Dam bao `questions.json` parse duoc JSON hop le.
- Dam bao `question_count` la 40.
- Dam bao question numbers phu du 1-40, khong thieu, khong trung.
- Listening phai chia du 4 part qua `part_id`.
- Reading phai chia du 3 passage qua `passage_id`.
- `prompt_html` khong nen dua ca noi dung dap an/key/explanation.
- `instruction` khong lap nguyen doan summary/passage.
- Neu import tu HTML/PDF, can sanitize HTML: bo script, style, navigation, popup, ads, dap an/key.
- Copy asset can thiet ve repo hoac rewrite path cho anh/audio dung voi GitHub Pages.
- Test nhanh tren browser:
  - vao duoc guest/student;
  - khong co alert loi tai du lieu;
  - Reading co passage va question;
  - Listening co audio/timeline va 4 part;
  - nav 1-40 hien du;
  - input inline va input fallback dong bo.

## 9. Cac file da cham trong dot nay

- `mock/assets/css/test-engine.css`
- `mock/listening/test-runner.html`
- `mock/listening/test-runner.js`
- `mock/reading/test-runner.html`
- `mock/reading/test-runner.js`
- `mock/listening/data/TEST_1/questions.json` den `mock/listening/data/TEST_8/questions.json`
- Mot so file `official-sample-test` duoc dieu chinh lien quan font Roboto, huong dan va an `skill_tag` trong ket qua.

## 10. Nguyen tac backup/import

- Truoc khi overwrite JSON production, backup file cu sang folder backup ngoai repo hoac trong khu vuc rieng.
- Khi dung HTML lam nguon tham chieu, nen import tung phan:
  - Lan 1: introduction/instruction only.
  - Lan 2: prompt layout.
  - Lan 3: items/options/question type.
- Sau moi lan import, chay audit dem cau 1-40 va smoke test tren browser.
