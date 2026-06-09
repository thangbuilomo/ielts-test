const GAS_URL = 'https://script.google.com/macros/s/AKfycbz6mSuAhOl6yIEfuYYLPUvi4LAjTOTwA0t3ik5MBi515I7twRBsWNLR-2apjRwqQgPbFw/exec';
const POST_SUBMIT_DB_URL = 'https://raw.githubusercontent.com/thangbuilomo/audio-ielts/main/vault-9/explanation_key_database.json';
const POST_SUBMIT_RAW_BASE = 'https://raw.githubusercontent.com/thangbuilomo/audio-ielts/main/vault-9';

const state = {
  testId: '',
  mode: 'none', // 'guest' or 'student'
  studentData: null, // { email, student_name, auth_token }

  // Data loaded from JSON
  manifest: null,
  content: null,
  questions: null,

  // Runtime
  startTime: 0,
  durationSeconds: 3600, // 60 mins default
  timerInterval: null,

  // Anti-cheat
  violationCount: 0,
  events: [],

  // Answers: map of qid -> string or array
  answers: {},
  reviews: {},
  selectionGroups: {},
  activePassageIndex: 0,
  postSubmitFeedback: null,

  // Graded results
  gradedResult: null,

  // Status
  isSubmitted: false
};

const MODULE_NAME = 'Reading';
const EXAM_BRAND = 'Saola IELTS Actual Exam Vault 9';

function testNumber() {
  const match = String(state.testId || '').match(/(\d+)/);
  return match ? match[1].padStart(2, '0') : '01';
}

function displayTestTitle() {
  return `${EXAM_BRAND} - Test ${testNumber()}`;
}

function backendTestId() {
  const normalized = (state.testId || '').replace(/^TEST_(\d+)$/i, 'Test_$1');
  return `Vol9_${MODULE_NAME}_${normalized}`;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} (${response.status})`);
  }
  return response.json();
}

async function fetchJsonQuiet(path) {
  try {
    return await fetchJson(path);
  } catch (error) {
    console.warn(`Unable to load ${path}`, error);
    return {};
  }
}

function normalizeDbId(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function hasAnswerKeyData(feedback) {
  const root = feedback && feedback.json_key ? feedback.json_key : {};
  const answerKey = root.answer_key || root;
  const answerGroups = root.answer_groups || {};
  return Object.keys(answerKey || {}).some(qid => /^q\d+/i.test(qid)) || Object.keys(answerGroups || {}).length > 0;
}

async function loadLocalPostSubmitFeedback(basePath) {
  const [answerKey, explanations, highlights] = await Promise.all([
    fetchJsonQuiet(basePath + 'answer_key.json'),
    state.mode === 'student' ? fetchJsonQuiet(basePath + 'explanations.json') : Promise.resolve({}),
    fetchJsonQuiet(basePath + 'source_annotations.json')
  ]);

  return {
    json_key: answerKey,
    explanation_json: explanations,
    highlight_json: highlights
  };
}

async function loadRemotePostSubmitEntry() {
  const db = await fetchJsonQuiet(POST_SUBMIT_DB_URL);
  const rows = Array.isArray(db.rows) ? db.rows : [];
  const testId = normalizeDbId(backendTestId());
  const canonicalTestId = normalizeDbId(state.questions && state.questions.test_id);
  const moduleName = MODULE_NAME.toLowerCase();

  return rows.find(row => {
    const rowTestId = normalizeDbId(row.test_id);
    const rowCanonicalId = normalizeDbId(row.canonical_test_id);
    const rowModule = String(row.module || row.skill || '').trim().toLowerCase();
    const testMatches = rowTestId === testId || rowCanonicalId === testId || (canonicalTestId && rowCanonicalId === canonicalTestId);
    const moduleMatches = rowModule === moduleName || rowModule === MODULE_NAME.toLowerCase();
    return testMatches && moduleMatches;
  }) || null;
}

function fallbackRemotePostSubmitUrls() {
  const moduleSlug = MODULE_NAME.toLowerCase();
  const testSlug = `test-${testNumber()}`;
  const baseUrl = `${POST_SUBMIT_RAW_BASE}/${moduleSlug}/${testSlug}`;
  return {
    answer_key_url: `${baseUrl}/answer_key.json`,
    annotated_url: `${baseUrl}/source_annotations.json`,
    explanations_url: `${baseUrl}/explanations.json`
  };
}

async function loadRemotePostSubmitFeedback() {
  const entry = await loadRemotePostSubmitEntry();
  const urls = entry || fallbackRemotePostSubmitUrls();

  const [answerKey, highlights, explanations] = await Promise.all([
    fetchJsonQuiet(urls.answer_key_url),
    fetchJsonQuiet(urls.annotated_url),
    state.mode === 'student' ? fetchJsonQuiet(urls.explanations_url) : Promise.resolve({})
  ]);

  return {
    json_key: answerKey,
    explanation_json: explanations,
    highlight_json: highlights
  };
}

async function loadPostSubmitFeedback(basePath) {
  const localFeedback = await loadLocalPostSubmitFeedback(basePath);
  if (hasAnswerKeyData(localFeedback)) return localFeedback;

  const remoteFeedback = await loadRemotePostSubmitFeedback();
  if (hasAnswerKeyData(remoteFeedback)) return remoteFeedback;

  return localFeedback;
}

function getQuestionGroups() {
  return Array.isArray(state.questions && state.questions.question_groups)
    ? state.questions.question_groups
    : [];
}

function getPassages() {
  return Array.isArray(state.content && state.content.passages)
    ? state.content.passages
    : [];
}

function getPassageIndexForGroup(group) {
  const groupPassageId = String(group && group.passage_id || '').trim();
  const passages = getPassages();
  if (groupPassageId && passages.length) {
    const foundIndex = passages.findIndex(passage => passage.passage_id === groupPassageId);
    if (foundIndex !== -1) return foundIndex;
  }

  const fallbackMatch = groupPassageId.match(/p(\d+)/i);
  if (fallbackMatch) return Math.max(0, Number(fallbackMatch[1]) - 1);

  const rangeStart = Array.isArray(group && group.question_range) ? Number(group.question_range[0]) : 0;
  if (rangeStart >= 1 && rangeStart <= 13) return 0;
  if (rangeStart >= 14 && rangeStart <= 26) return 1;
  if (rangeStart >= 27) return 2;
  return 0;
}

function getVisibleQuestionGroups() {
  return getQuestionGroups().filter(group => getPassageIndexForGroup(group) === state.activePassageIndex);
}

function getPassageIndexForQuestion(qid) {
  const group = getQuestionGroups().find(candidate => {
    return (candidate.items || []).some(question => getQuestionId(question) === qid);
  });
  return group ? getPassageIndexForGroup(group) : state.activePassageIndex;
}

function getQuestionId(question) {
  return question.question_id || question.id;
}

function getOrderedQuestionIds() {
  const ids = [];
  getQuestionGroups().forEach(group => {
    (group.items || []).forEach(question => {
      const qid = getQuestionId(question);
      if (qid && !ids.includes(qid)) ids.push(qid);
    });
  });
  return ids;
}

function isAnsweredValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return String(value || '').trim().length > 0;
}

function answerToString(value) {
  return Array.isArray(value) ? value.join(', ') : String(value || '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getQuestionNumberFromGroup(group, qid) {
  const item = (group && group.items || []).find(question => getQuestionId(question) === qid);
  if (item && item.number) return item.number;
  const match = String(qid || '').match(/\d+/);
  return match ? Number(match[0]) : '';
}

function makeBlankInput(qid, number = '') {
  const label = number ? `Question ${number}` : 'Question';
  const badge = number ? `<span class="inline-question-badge">${escapeHtml(number)}</span>` : '';
  return `<span class="inline-answer-anchor">${badge}<input type="text" class="blank-input inline-answer-input input-element" data-qid="${qid}" placeholder="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" oninput="saveAnswer('${qid}', this.value, this)"></span>`;
}

function replaceBlankTags(html, group = null) {
  const assetBase = `data/${state.testId}/assets/`;
  return String(html || '')
    .replace(/(<(?:img|source)\b[^>]*\bsrc=["'])assets\//gi, `$1${assetBase}`)
    .replace(/&lt;blank data-qid=&quot;([^&"]+)&quot;\/?&gt;/g, (_, qid) => makeBlankInput(qid, getQuestionNumberFromGroup(group, qid)))
    .replace(/<blank data-qid="([^"]+)"\s*\/?>/g, (_, qid) => makeBlankInput(qid, getQuestionNumberFromGroup(group, qid)));
}

function normalizeOptions(options) {
  return Array.isArray(options)
    ? options
        .map(option => (typeof option === 'string' ? { label: option, text: '' } : option))
        .filter(option => option && option.label)
    : [];
}

function buildOptionsHtml(options) {
  return normalizeOptions(options)
    .map(option => {
      const label = escapeHtml(option.label);
      const text = escapeHtml(option.text || '');
      return `<option value="${label}">${label}${text ? ` - ${text}` : ''}</option>`;
    })
    .join('');
}

function shouldHideVerboseInstruction(group) {
  const qType = group.question_type || '';
  return Boolean(group.prompt_html)
    && /(completion|short_answer|table|summary|note|sentence)/i.test(qType);
}

function helpContentHtml() {
  return `
    <div class="exam-help-panel">
      <div class="exam-help-title">Huong dan thao tac:</div>
      <div class="exam-help-grid">
        <div class="exam-help-card">
          <h3 style="color: var(--accent-color);">1. Highlight van ban</h3>
          <p>Boi den mot doan text bat ky va <strong>click chuot phai</strong> de hien thi bang mau highlight.</p>
          <div class="help-demo-box">
            This is a <span class="help-highlight-sample">sample text to highlight</span> in reading.
            <div class="help-color-menu">
              <span class="help-color-dot" style="background:#fef08a; border-color:#facc15;"></span>
              <span class="help-color-dot" style="background:#bbf7d0; border-color:#86efac;"></span>
              <span class="help-color-dot" style="background:#fbcfe8; border-color:#f9a8d4;"></span>
            </div>
          </div>
        </div>
        <div class="exam-help-card">
          <h3 style="color: var(--review-color);">2. Danh dau xem lai (Review)</h3>
          <p><strong>Click vao so thu tu</strong> o thanh duoi cung de gan co can xem lai (vong tron mau cam).</p>
          <div class="help-review-demo">
            <span class="help-review-dot answered">12</span>
            <span class="help-review-dot review">13</span>
            <span class="help-review-dot">14</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setupHelpUi() {
  const startCard = document.querySelector('.start-gate-card');
  const featureList = document.querySelector('.feature-intro-list');
  const loginBox = document.getElementById('studentEmail')?.closest('div');
  const guestBox = document.getElementById('guestBtn')?.closest('div');
  if (startCard) {
    startCard.classList.add('official-guide');
    if (!startCard.querySelector('.card-kicker')) {
      const kicker = document.createElement('span');
      kicker.className = 'card-kicker';
      kicker.textContent = 'Practice Mode';
      startCard.insertBefore(kicker, startCard.firstElementChild);
    }
    const desc = startCard.querySelector('h1 + p');
    if (desc) {
      desc.textContent = 'Bai luyen tap kiem tra ky nang IELTS Reading dua tren bo de Saola IELTS Actual Exam Vault 9.';
    }
  }
  if (loginBox) loginBox.classList.add('start-auth-panel');
  if (guestBox) guestBox.classList.add('start-guest-panel');
  if (featureList) featureList.style.display = 'none';
  if (startCard && featureList && !document.getElementById('startHelpPanel')) {
    const panel = document.createElement('div');
    panel.id = 'startHelpPanel';
    panel.innerHTML = helpContentHtml();
    featureList.insertAdjacentElement('afterend', panel);
  }

  if (!document.getElementById('helpModal')) {
    const modal = document.createElement('div');
    modal.id = 'helpModal';
    modal.className = 'start-gate-overlay';
    modal.style.display = 'none';
    modal.style.zIndex = '3005';
    modal.innerHTML = `
      <div class="help-modal-card">
        <div class="help-modal-header">
          <h2>Test tools</h2>
          <button class="close-help-btn" id="closeHelpBtn" type="button" aria-label="Close help">x</button>
        </div>
        <div id="helpModalContent">${helpContentHtml()}</div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const openBtn = document.getElementById('openHelpBtn');
  const closeBtn = document.getElementById('closeHelpBtn');
  const modal = document.getElementById('helpModal');
  if (openBtn && modal) openBtn.onclick = () => { modal.style.display = 'flex'; };
  if (closeBtn && modal) closeBtn.onclick = () => { modal.style.display = 'none'; };
}

function setupPassageFontControls() {
  const leftPanel = document.getElementById('leftPanel');
  const content = document.getElementById('passagesContentContainer');
  if (!leftPanel || !content || document.getElementById('passageToolbar')) return;

  let size = 1.04;
  const toolbar = document.createElement('div');
  toolbar.id = 'passageToolbar';
  toolbar.className = 'passage-toolbar';
  toolbar.innerHTML = `
    <span class="passage-toolbar-label">Passage text size</span>
    <div class="passage-font-controls">
      <button class="passage-font-btn" type="button" id="fontSmallerBtn" title="Smaller text">A-</button>
      <button class="passage-font-btn" type="button" id="fontResetBtn" title="Reset text size">100</button>
      <button class="passage-font-btn" type="button" id="fontLargerBtn" title="Larger text">A+</button>
    </div>
  `;
  leftPanel.insertBefore(toolbar, content);

  const applySize = () => {
    document.documentElement.style.setProperty('--passage-font-size', `${size.toFixed(2)}rem`);
  };
  document.getElementById('fontSmallerBtn').onclick = () => {
    size = Math.max(0.86, size - 0.06);
    applySize();
  };
  document.getElementById('fontResetBtn').onclick = () => {
    size = 1.04;
    applySize();
  };
  document.getElementById('fontLargerBtn').onclick = () => {
    size = Math.min(1.34, size + 0.06);
    applySize();
  };
}

function setupHighlighter(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container || container.dataset.highlighterReady) return;
  container.dataset.highlighterReady = 'true';
  let menu = null;

  const hideMenu = () => {
    if (menu) {
      menu.remove();
      menu = null;
    }
  };

  const applyHighlight = (color) => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    if (color === 'clear') {
      document.execCommand('removeFormat', false, null);
      selection.removeAllRanges();
      return;
    }

    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.className = `hl-${color}`;
    try {
      range.surroundContents(span);
    } catch (err) {
      const colorMap = { yellow: '#fef08a', green: '#bbf7d0', pink: '#fbcfe8', blue: '#bfdbfe' };
      document.execCommand('backColor', false, colorMap[color] || '#fef08a');
    }
    selection.removeAllRanges();
  };

  container.addEventListener('contextmenu', (event) => {
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) return;
    event.preventDefault();
    event.stopPropagation();
    hideMenu();

    menu = document.createElement('div');
    menu.className = 'hl-menu';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    ['yellow', 'green', 'pink', 'blue', 'clear'].forEach(color => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `hl-btn ${color}`;
      button.title = color === 'clear' ? 'Clear highlight' : `Highlight ${color}`;
      button.onclick = () => {
        applyHighlight(color);
        hideMenu();
      };
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
  });

  document.addEventListener('mousedown', (event) => {
    if (menu && !menu.contains(event.target)) hideMenu();
  });
}

function isHighlightContext(event) {
  const selection = window.getSelection();
  return Boolean(selection && selection.toString().trim() && event.target.closest('.split-container'));
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  state.testId = urlParams.get('test');
  if (!state.testId) {
    alert("Không tìm thấy mã bài test. Trở về trang chủ.");
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('testTitleGate').textContent = displayTestTitle();
  document.title = displayTestTitle();
  setupHelpUi();

  setupStartGate();
});

function setupStartGate() {
  const loginBtn = document.getElementById('loginBtn');
  const guestBtn = document.getElementById('guestBtn');

  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('studentEmail').value.trim();
    const password = document.getElementById('studentPassword').value.trim();
    const errDiv = document.getElementById('loginError');

    if (!email || !password) {
      errDiv.textContent = "Vui lòng nhập đủ email và mật khẩu";
      errDiv.style.display = 'block';
      return;
    }

    loginBtn.textContent = 'Đang đăng nhập...';
    loginBtn.disabled = true;
    errDiv.style.display = 'none';

    try {
      let response;
      if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Local bypass: login always succeeds offline/locally for testing explanations
        response = {
          ok: true,
          student_name: email.split('@')[0] || "Local Student",
          email: email,
          auth_token: "local_bypass_token"
        };
      } else {
        response = await jsonpFetch(GAS_URL, {
          action: 'auth_student',
          email: email,
          password: password,
          test_id: backendTestId()
        });
      }

      if (response && response.ok) {
        state.mode = 'student';
        state.studentData = response;
        document.getElementById('studentNameDisplay').textContent = response.student_name;
        document.getElementById('startOverlay').style.display = 'none';
        startTest();
      } else {
        errDiv.textContent = response.message || "Đăng nhập thất bại. Vui lòng thử lại.";
        errDiv.style.display = 'block';
      }
    } catch(e) {
      errDiv.textContent = "Lỗi kết nối máy chủ. Vui lòng thử lại.";
      errDiv.style.display = 'block';
    } finally {
      loginBtn.textContent = 'Đăng nhập & Bắt đầu';
      loginBtn.disabled = false;
    }
  });

  guestBtn.addEventListener('click', () => {
    state.mode = 'guest';
    document.getElementById('studentNameDisplay').textContent = "Guest Mode (Offline)";
    document.getElementById('startOverlay').style.display = 'none';
    startTest();
  });
}

// --- JSONP Helper for Auth ---
function jsonpFetch(url, params) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_cb_' + Math.round(100000 * Math.random());
    window[callbackName] = function(data) {
      delete window[callbackName];
      document.body.removeChild(script);
      resolve(data);
    };

    const qs = new URLSearchParams(params);
    qs.append('callback', callbackName);

    const script = document.createElement('script');
    script.src = url + '?' + qs.toString();
    script.onerror = () => reject(new Error('JSONP failed'));
    document.body.appendChild(script);
  });
}

// --- Load Test Data ---

async function startTest() {
  try {
    const basePath = `data/${state.testId}/`;

    const [manifest, content, questions] = await Promise.all([
      fetchJson(basePath + 'manifest.json'),
      fetchJson(basePath + 'content.json'),
      fetchJson(basePath + 'questions.json')
    ]);

    state.manifest = manifest;
    state.content = content;
    state.questions = questions;
    state.activePassageIndex = 0;
    state.postSubmitFeedback = null;

    document.getElementById('headerTestTitle').textContent = displayTestTitle();

    renderPassages();
    renderQuestions();
    setupNavigation();
    setupPassageFontControls();
    setupHighlighter('.split-container');

    // Timer
    state.startTime = Date.now();
    startTimer();

    // Anti-cheat
    if (state.mode === 'student') {
      setupAntiCheat();
    }

    // Resizer
    setupResizer();

  } catch(e) {
    alert("Lỗi tải dữ liệu bài test: " + e.message);
  }
}

// --- Rendering Passages ---

function renderPassages() {
  const tabsContainer = document.getElementById('passageTabsContainer');
  const contentContainer = document.getElementById('passagesContentContainer');

  tabsContainer.innerHTML = '';
  contentContainer.innerHTML = '';

  const passages = getPassages();

  passages.forEach((p, idx) => {
    const isActive = idx === state.activePassageIndex;

    // Tab
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `passage-tab-btn ${isActive ? 'active' : ''}`;
    btn.textContent = `Passage ${idx + 1}`;
    btn.dataset.target = `passage-${idx}`;
    btn.addEventListener('click', () => switchPassage(idx));
    tabsContainer.appendChild(btn);

    // Content
    const div = document.createElement('div');
    div.className = `passage-content ${isActive ? 'active' : ''}`;
    div.id = `passage-${idx}`;

    let html = `<h2>${escapeHtml(p.title || `Passage ${idx + 1}`)}</h2>`;
    if (Array.isArray(p.sections)) {
      p.sections.forEach(section => {
        const sectionId = `${p.passage_id || `p${idx + 1}`}-${section.section_id || ''}`.replace(/\s+/g, '-');
        html += `<section class="passage-section" id="${escapeHtml(sectionId)}">`;
        if (section.section_id) {
          html += `<div class="passage-section-label">${escapeHtml(section.section_id)}</div>`;
        }
        html += section.content_html || '';
        html += `</section>`;
      });
    } else if (Array.isArray(p.paragraphs)) {
      p.paragraphs.forEach(para => {
        html += `<p id="${escapeHtml(para.id)}">${para.text || ''}</p>`;
      });
    } else if (p.content_html) {
      html += p.content_html;
    }

    div.innerHTML = html;
    contentContainer.appendChild(div);
  });
}

function switchPassage(idx, options = {}) {
  const passages = getPassages();
  const maxIndex = Math.max(0, passages.length - 1);
  const nextIndex = Math.min(Math.max(Number(idx) || 0, 0), maxIndex);
  state.activePassageIndex = nextIndex;

  document.querySelectorAll('.passage-tab-btn').forEach((b, i) => {
    b.classList.toggle('active', i === nextIndex);
  });
  document.querySelectorAll('.passage-content').forEach((c, i) => {
    c.classList.toggle('active', i === nextIndex);
  });

  renderQuestions();
  if (state.isSubmitted && state.postSubmitFeedback) {
    processFeedbackV2(state.postSubmitFeedback);
  } else {
    updateNavDots();
  }

  if (options.scrollQid) {
    requestAnimationFrame(() => scrollToQuestion(options.scrollQid));
  } else if (!options.keepScroll) {
    const rightPanel = document.getElementById('rightPanel');
    const leftPanel = document.getElementById('leftPanel');
    if (rightPanel) rightPanel.scrollTop = 0;
    if (leftPanel) leftPanel.scrollTop = 0;
  }
}

// --- Rendering Questions ---

function renderQuestions() {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';

  const groups = getVisibleQuestionGroups();
  if (!groups.length) {
    console.error('No visible question_groups found for active passage');
    return;
  }

  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'question-group-card';

    const hideInstruction = shouldHideVerboseInstruction(group);
    let html = `<h3>Questions ${group.question_range ? group.question_range.join(' - ') : ''}</h3>`;
    if (group.instruction && !hideInstruction) {
      html += `<div class="instruction-box">${group.instruction}</div>`;
    }

    // Process <blank> tags in prompt_html
    if (group.prompt_html) {
      let processedPrompt = replaceBlankTags(group.prompt_html, group);
      html += `<div class="prompt-box">${processedPrompt}</div>`;
    }

    const groupBody = document.createElement('div');
    groupBody.innerHTML = html;

    const qType = group.question_type || '';
    if (qType.includes('mcq_multi') && group.selection_group && group.options) {
      renderSelectionGroup(group, groupBody);
      card.appendChild(groupBody);
      container.appendChild(card);
      return;
    }

    // Render specific question types from items
    if (group.items && group.items.length > 0) {
      group.items.forEach(q => {
        const qid = getQuestionId(q);
        const qDiv = document.createElement('div');
        qDiv.id = `question-container-${qid}`;
        qDiv.className = 'question-item';

        let qHtml = `<strong>${q.number}.</strong> `;

        // If it's a completion type, the blank is usually in prompt_html, so we don't need to render much here,
        // EXCEPT if the item itself has a prompt_html that needs a blank.
        let itemText = q.prompt_html || q.text || '';
        itemText = replaceBlankTags(itemText, group);

        const qType = group.question_type || q.type || '';

        if (qType.includes('tfng') || qType.includes('ynng') || qType === 'yes_no_not_given') {
          qHtml += `${itemText} <br><div style="margin-top: 8px;">
            <label class="mcq-option"><input type="radio" name="q_${qid}" value="${qType.includes('tfng') ? 'TRUE' : 'YES'}" class="input-element" onchange="saveAnswer('${qid}', this.value, this)"> <span>${qType.includes('tfng') ? 'TRUE' : 'YES'}</span></label>
            <label class="mcq-option"><input type="radio" name="q_${qid}" value="${qType.includes('tfng') ? 'FALSE' : 'NO'}" class="input-element" onchange="saveAnswer('${qid}', this.value, this)"> <span>${qType.includes('tfng') ? 'FALSE' : 'NO'}</span></label>
            <label class="mcq-option"><input type="radio" name="q_${qid}" value="NOT GIVEN" class="input-element" onchange="saveAnswer('${qid}', this.value, this)"> <span>NOT GIVEN</span></label>
          </div>`;
        }
        else if (q.response_type === 'select' || qType.includes('matching') || qType.includes('labeling')) {
          let optionsHtml = '<option value="">-- Select --</option>';
          optionsHtml += buildOptionsHtml(q.options || group.options || group.choices || []);
          qHtml += `${itemText} <br><select style="margin-top: 8px;" class="matching-select input-element" data-qid="${qid}" onchange="saveAnswer('${qid}', this.value, this)">${optionsHtml}</select>`;
        }
        else if (qType.includes('mcq')) {
          qHtml += `${itemText}<div style="margin-top: 10px;">`;
          const opts = q.options || group.options || [];
          opts.forEach(opt => {
            qHtml += `<label class="mcq-option" id="opt-${qid}-${opt.label}">
              <input type="${qType.includes('multi') ? 'checkbox' : 'radio'}" name="q_${qid}" value="${opt.label}" class="input-element" onchange="saveAnswer('${qid}', this.value, this)">
              <span><strong>${opt.label}</strong>. ${opt.text}</span>
            </label>`;
          });
          qHtml += `</div>`;
        }
        else if (qType.includes('completion') || qType.includes('short_answer')) {
           // For completion, if there is item text without blanks, we can append an input box
           if (!itemText.includes('<input')) {
             qHtml += `${itemText} <br><input type="text" style="margin-top: 8px;" class="blank-input input-element" data-qid="${qid}" placeholder="Question ${escapeHtml(q.number || '')}" oninput="saveAnswer('${qid}', this.value, this)">`;
           } else {
             qHtml += itemText;
           }
        }
        else {
           // fallback text input
           qHtml += `${itemText} <br><input type="text" style="margin-top: 8px;" class="blank-input input-element" data-qid="${qid}" placeholder="Question ${escapeHtml(q.number || '')}" oninput="saveAnswer('${qid}', this.value, this)">`;
        }

        qDiv.innerHTML = qHtml;

        // Add Explanation Container (Hidden initially)
        const expDiv = document.createElement('div');
        expDiv.id = `explanation-${qid}`;
        expDiv.style.display = 'none';
        qDiv.appendChild(expDiv);

        groupBody.appendChild(qDiv);
      });
    }

    card.appendChild(groupBody);
    container.appendChild(card);
  });

  // Add submit confirm button
  const submitBtn = document.createElement('button');
  submitBtn.className = 'start-test-btn';
  submitBtn.textContent = 'Hoàn thành & Nộp bài';
  submitBtn.style.marginTop = '20px';
  submitBtn.onclick = checkUnanswered;
  container.appendChild(submitBtn);

  restoreRenderedAnswers();
  if (state.isSubmitted) {
    document.querySelectorAll('#questionsContainer .input-element').forEach(el => {
      el.disabled = true;
    });
  }
}

function renderSelectionGroup(group, groupBody) {
  const selection = group.selection_group;
  const groupId = selection.selection_group_id || group.group_id;
  const questionIds = Array.isArray(selection.question_ids)
    ? selection.question_ids
    : (group.items || []).map(getQuestionId).filter(Boolean);
  const maxSelect = selection.max_select || questionIds.length;
  state.selectionGroups[groupId] = { questionIds, maxSelect };

  const wrapper = document.createElement('div');
  wrapper.className = 'selection-group-card';

  questionIds.forEach(qid => {
    const anchor = document.createElement('div');
    anchor.id = `question-container-${qid}`;
    anchor.className = 'selection-anchor';
    wrapper.appendChild(anchor);
  });

  const optionsHtml = normalizeOptions(group.options).map(option => {
    const label = escapeHtml(option.label);
    const text = escapeHtml(option.text || '');
    return `<label class="mcq-option">
      <input type="checkbox" value="${label}" class="input-element" data-selection-group="${groupId}" onchange="saveSelectionGroup('${groupId}', this)">
      <span><strong>${label}</strong>${text ? `. ${text}` : ''}</span>
    </label>`;
  }).join('');

  wrapper.innerHTML += `
    <div class="selection-helper">Select ${maxSelect} answers.</div>
    <div class="mcq-group">${optionsHtml}</div>
  `;

  questionIds.forEach(qid => {
    const expDiv = document.createElement('div');
    expDiv.id = `explanation-${qid}`;
    expDiv.style.display = 'none';
    wrapper.appendChild(expDiv);
  });

  groupBody.appendChild(wrapper);
}

window.saveAnswer = function(qid, value, sourceEl = null) {
  if (state.isSubmitted) return;
  state.answers[qid] = typeof value === 'string' ? value.trim() : value;
  syncAnswerControls(qid, value, sourceEl);
  updateNavDots();
};

function syncAnswerControls(qid, value, sourceEl) {
  document.querySelectorAll(`[data-qid="${qid}"]`).forEach(control => {
    if (control === sourceEl) return;
    if (control.type === 'radio' || control.type === 'checkbox') {
      control.checked = control.value === value;
    } else {
      control.value = value || '';
    }
  });
}

function restoreRenderedAnswers() {
  Object.entries(state.answers || {}).forEach(([qid, value]) => {
    const textValue = answerToString(value);
    syncAnswerControls(qid, textValue, null);
    document.querySelectorAll(`input[name="q_${qid}"]`).forEach(control => {
      control.checked = control.value === textValue;
    });
  });

  Object.entries(state.selectionGroups || {}).forEach(([groupId, group]) => {
    const selectedValues = (group.questionIds || [])
      .map(qid => answerToString(state.answers[qid]))
      .filter(Boolean);
    document.querySelectorAll(`input[data-selection-group="${groupId}"]`).forEach(control => {
      control.checked = selectedValues.includes(control.value);
    });
  });
}

window.saveSelectionGroup = function(groupId, changedInput) {
  if (state.isSubmitted) return;
  const group = state.selectionGroups[groupId];
  if (!group) return;

  const checked = Array.from(document.querySelectorAll(`input[data-selection-group="${groupId}"]:checked`));
  if (checked.length > group.maxSelect) {
    changedInput.checked = false;
    return;
  }

  group.questionIds.forEach((qid, index) => {
    state.answers[qid] = checked[index] ? checked[index].value : '';
  });
  updateNavDots();
};

// --- Navigation ---
function setupNavigation() {
  const nav = document.getElementById('navigationBar');
  nav.innerHTML = '';

  let qNum = 1;
  getQuestionGroups().forEach(group => {
    if (group.items) {
      group.items.forEach(q => {
        const qid = getQuestionId(q);
        const dot = document.createElement('div');
        dot.className = 'nav-dot';
        dot.textContent = q.number || qNum++;
        dot.id = `nav-dot-${qid}`;
        dot.dataset.passageIndex = String(getPassageIndexForQuestion(qid));
        dot.onclick = () => {
          // Toggle review state
          state.reviews[qid] = !state.reviews[qid];
          updateNavDots();
          const targetPassageIndex = getPassageIndexForQuestion(qid);
          if (targetPassageIndex !== state.activePassageIndex) {
            switchPassage(targetPassageIndex, { scrollQid: qid, keepScroll: true });
          } else {
            scrollToQuestion(qid);
          }
        };
        nav.appendChild(dot);
      });
    }
  });
}

function updateNavDots() {
  document.querySelectorAll('.nav-dot').forEach(dot => {
    const qid = dot.id.replace('nav-dot-', '');
    dot.className = 'nav-dot'; // Reset classes
    if (state.reviews[qid]) {
      dot.classList.add('review');
    } else if (state.answers[qid] && state.answers[qid].length > 0) {
      dot.classList.add('answered');
    }
  });
}

function scrollToQuestion(qid) {
  const inlineControl = document.querySelector(`[data-qid="${qid}"]`);
  const el = inlineControl
    ? (inlineControl.closest('.inline-answer-anchor') || inlineControl.closest('.question-item') || inlineControl)
    : document.getElementById(`question-container-${qid}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- Timer ---
function startTimer() {
  const display = document.getElementById('timerDisplay');
  state.timerInterval = setInterval(() => {
    if (state.isSubmitted) {
      clearInterval(state.timerInterval);
      return;
    }

    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const remaining = state.durationSeconds - elapsed;

    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      display.textContent = "00:00";
      logEvent('AUTO_SUBMIT', 'Timer expired');
      submitTest();
    } else {
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      display.textContent = `${m}:${s}`;
    }
  }, 1000);
}

// --- Anti-cheat ---
function logEvent(type, detail) {
  state.events.push({
    event_id: 'evt_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    event_type: type,
    event_time: new Date().toISOString(),
    elapsed_seconds: Math.floor((Date.now() - state.startTime)/1000),
    payload: detail
  });
}

function setupAntiCheat() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !state.isSubmitted) {
      state.violationCount++;
      logEvent('TAB_SWITCH', 'User switched tabs or minimized');
      showCheatWarning();
    }
  });

  document.addEventListener('copy', (e) => {
    if(!state.isSubmitted) { e.preventDefault(); logEvent('COPY_BLOCKED', ''); }
  });

  document.addEventListener('contextmenu', (e) => {
    if (isHighlightContext(e)) return;
    if(!state.isSubmitted) { e.preventDefault(); logEvent('RIGHT_CLICK_BLOCKED', ''); }
  });
}

function showCheatWarning() {
  document.getElementById('cheatWarningMsg').textContent = `Bạn đã chuyển tab hoặc rời khỏi trang. Vi phạm lần ${state.violationCount}. Bài thi có thể bị hủy nếu vi phạm quá nhiều.`;
  document.getElementById('cheatModal').style.display = 'flex';
}

// --- Submit & Grade ---

document.getElementById('headerSubmitBtn').onclick = checkUnanswered;
document.getElementById('cancelSubmitBtn').onclick = () => document.getElementById('confirmSubmitModal').style.display = 'none';
document.getElementById('confirmSubmitBtn').onclick = () => {
  document.getElementById('confirmSubmitModal').style.display = 'none';
  submitTest();
};

function checkUnanswered() {
  if (state.isSubmitted) return;
  let total = 0;
  let answered = 0;

  if (getQuestionGroups().length) {
    getQuestionGroups().forEach(g => {
      if (g.items) {
        g.items.forEach(q => {
          const qid = getQuestionId(q);
          total++;
          if (isAnsweredValue(state.answers[qid])) answered++;
        });
      }
    });
  }

  const un = total - answered;
  if (un > 0) {
    document.getElementById('unansweredCount').textContent = un;
    document.getElementById('confirmSubmitModal').style.display = 'flex';
  } else {
    submitTest();
  }
}

async function submitTest() {
  state.isSubmitted = true;
  clearInterval(state.timerInterval);
  document.getElementById('loadingModal').style.display = 'flex';

  // Disable all inputs
  document.querySelectorAll('.input-element').forEach(el => el.disabled = true);

  try {
    const basePath = `data/${state.testId}/`;
    const feedback = await loadPostSubmitFeedback(basePath);

    state.postSubmitFeedback = feedback;
    processFeedbackV2(feedback);
  } catch(e) {
    alert("Lỗi hiển thị đáp án và giải thích local: " + e.message);
    console.error(e);
  } finally {
    document.getElementById('loadingModal').style.display = 'none';
  }
}

function processFeedbackV2(feedback) {
  const answerKeyRoot = feedback.json_key || {};
  const answerKey = answerKeyRoot.answer_key || answerKeyRoot;
  const answerGroups = answerKeyRoot.answer_groups || {};
  const explanationsRoot = feedback.explanation_json || {};
  const explanations = explanationsRoot.explanations || explanationsRoot;
  const highlights = feedback.highlight_json || {};
  const groupResults = buildGroupResults(answerGroups);
  const qids = getOrderedQuestionIds().filter(qid => answerKey[qid] || groupResults[qid]);

  Object.keys(answerKey).forEach(qid => {
    if (/^q\d+/i.test(qid) && !qids.includes(qid)) qids.push(qid);
  });

  let score = 0;
  qids.forEach(qid => {
    const result = resolveQuestionResult(qid, answerKey, groupResults);
    if (result.isCorrect) score++;

    document.querySelectorAll(`[data-qid="${qid}"]`).forEach(inputEl => {
      inputEl.classList.add(result.isCorrect ? 'correct' : 'incorrect');
    });

    document.querySelectorAll(`input[name="q_${qid}"]:checked`).forEach(checkedEl => {
      checkedEl.parentElement.classList.add(result.isCorrect ? 'correct' : 'incorrect');
    });

    const expDiv = document.getElementById(`explanation-${qid}`);
    if (expDiv) {
      expDiv.style.display = 'block';
      let html = `<div class="review-card ${result.isCorrect ? 'correct' : 'incorrect'}">
        <div class="review-meta">
          <span class="review-badge ${result.isCorrect ? 'correct' : 'incorrect'}">${result.isCorrect ? 'Correct' : 'Incorrect'}</span>
          <span>Your answer: <code>${escapeHtml(answerToString(state.answers[qid]) || '(blank)')}</code></span>
          <span class="review-answer-key">Correct answer: <code>${escapeHtml(result.correctStr)}</code></span>
        </div>`;

      if (explanations && explanations[qid] && explanations[qid].explanation_html) {
        html += `<div class="explanation-text">${explanations[qid].explanation_html}</div>`;
      } else if (state.mode === 'guest') {
        html += `<div class="pitfall-text">Detailed explanations are available after student login.</div>`;
      }

      html += `</div>`;
      expDiv.innerHTML = html;
    }

    const dot = document.getElementById(`nav-dot-${qid}`);
    if (dot) {
      dot.className = `nav-dot ${result.isCorrect ? 'answered correct' : 'answered incorrect'}`;
      dot.style.backgroundColor = result.isCorrect ? '#10b981' : '#ef4444';
      dot.style.color = '#fff';
    }
  });

  const scoreMax = answerKeyRoot.scoring?.raw_score_max || state.questions.question_count || qids.length || 40;
  const scoreBox = document.getElementById('postSubmitScoreContainer');
  scoreBox.style.display = 'block';
  scoreBox.innerHTML = `
    <div class="score-box">
      <h2>Káº¿t Quáº£ Cá»§a Báº¡n</h2>
      <div class="score-value">${score} / ${scoreMax}</div>
      <p>KÃ©o xuá»‘ng dÆ°á»›i hoáº·c nháº¥p vÃ o cÃ¡c Ã´ sá»‘ Ä‘á»ƒ xem Ä‘Ã¡p Ã¡n vÃ  giáº£i thÃ­ch.</p>
    </div>
  `;
  scoreBox.querySelector('h2').textContent = 'Your Result';
  scoreBox.querySelector('p').textContent = 'Scroll down or use the numbered navigation to review answers and explanations.';

  injectHighlightsV2(highlights);
}

function buildGroupResults(answerGroups) {
  const results = {};
  Object.values(answerGroups || {}).forEach(group => {
    const qids = Array.isArray(group.question_ids) ? group.question_ids : [];
    const correctAnswers = Array.isArray(group.answers) ? group.answers : [];
    const normalizedCorrect = correctAnswers.map(normalizeAnswerText);
    const usedCorrectIndexes = new Set();

    qids.forEach((qid, index) => {
      const normalizedUser = normalizeAnswerText(state.answers[qid]);
      let isCorrect = false;

      if (normalizedUser) {
        if (group.order_matters) {
          isCorrect = normalizedUser === normalizedCorrect[index];
        } else {
          const matchIndex = normalizedCorrect.findIndex((answer, answerIndex) => {
            return answer === normalizedUser && !usedCorrectIndexes.has(answerIndex);
          });
          if (matchIndex !== -1) {
            usedCorrectIndexes.add(matchIndex);
            isCorrect = true;
          }
        }
      }

      results[qid] = {
        isCorrect,
        correctStr: correctAnswers.join(' / ')
      };
    });
  });
  return results;
}

function resolveQuestionResult(qid, answerKey, groupResults) {
  if (groupResults[qid]) return groupResults[qid];

  const keyData = answerKey[qid];
  const correctAnswers = getCorrectAnswers(keyData);
  const normalizedUser = normalizeAnswerText(state.answers[qid]);
  const isCorrect = Boolean(normalizedUser) && correctAnswers.some(answer => normalizeAnswerText(answer) === normalizedUser);

  return {
    isCorrect,
    correctStr: correctAnswers.join(' OR ')
  };
}

function getCorrectAnswers(keyData) {
  if (Array.isArray(keyData)) return keyData;
  if (keyData && Array.isArray(keyData.answers)) return keyData.answers;
  if (keyData && keyData.answer != null) return [keyData.answer];
  if (typeof keyData === 'string' || typeof keyData === 'number') return [keyData];
  return [];
}

function normalizeAnswerText(value) {
  return answerToString(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function injectHighlightsV2(highlights) {
  if (!highlights) return;

  if (Array.isArray(highlights.passages)) {
    const sourcePassages = Array.isArray(state.content && state.content.passages) ? state.content.passages : [];
    highlights.passages.forEach((passage, fallbackIndex) => {
      const foundIndex = sourcePassages.findIndex(p => p.passage_id === passage.passage_id);
      const targetIndex = foundIndex === -1 ? fallbackIndex : foundIndex;
      const contentEl = document.getElementById(`passage-${targetIndex}`);
      if (!contentEl) return;

      let html = passage.title ? `<h2>${escapeHtml(passage.title)}</h2>` : '';
      if (Array.isArray(passage.sections)) {
        html += passage.sections.map(section => section.annotated_html || section.content_html || '').join('');
      } else if (passage.annotated_html) {
        html += passage.annotated_html;
      }

      if (html) contentEl.innerHTML = html;
    });
    return;
  }

  injectHighlights(highlights);
}

function processFeedback(feedback) {
  const answerKey = feedback.json_key || {};
  const highlights = feedback.highlight_json || {};
  const explanations = feedback.explanation_json || null;

  let score = 0;

  // Local grading logic
  for (let qid in answerKey) {
    const keyData = answerKey[qid];
    const userAns = (state.answers[qid] || '').toString().toLowerCase().trim();

    let isCorrect = false;
    let correctStr = "";

    if (Array.isArray(keyData)) {
      // Any of the options is correct
      isCorrect = keyData.some(k => k.toString().toLowerCase().trim() === userAns);
      correctStr = keyData.join(" OR ");
    } else {
      isCorrect = keyData.toString().toLowerCase().trim() === userAns;
      correctStr = keyData;
    }

    if (isCorrect) score++;

    // UI Update for inputs
    const inputEl = document.querySelector(`[data-qid="${qid}"]`);
    if (inputEl) {
      inputEl.classList.add(isCorrect ? 'correct' : 'incorrect');
    }

    // UI Update for MCQs
    if (userAns) {
      // Find the radio/checkbox they selected
      const checkedEl = document.querySelector(`input[name="q_${qid}"]:checked`);
      if (checkedEl) {
         checkedEl.parentElement.classList.add(isCorrect ? 'correct' : 'incorrect');
      }
    }

    // Show Review Card
    const expDiv = document.getElementById(`explanation-${qid}`);
    if (expDiv) {
      expDiv.style.display = 'block';
      let html = `<div class="review-card ${isCorrect ? 'correct' : 'incorrect'}">
        <div class="review-meta">
          <span class="review-badge ${isCorrect ? 'correct' : 'incorrect'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
          <span>Your answer: <code>${userAns || '(Trống)'}</code></span>
          <span class="review-answer-key">Correct answer: <code>${correctStr}</code></span>
        </div>`;

      // Inject Explanation
      if (explanations && explanations[qid]) {
        if (explanations[qid].explanation_html) {
          html += `<div class="explanation-text">${explanations[qid].explanation_html}</div>`;
        }
      } else if (state.mode === 'guest') {
        html += `<div class="pitfall-text">Hãy đăng nhập để xem giải thích chi tiết.</div>`;
      }

      html += `</div>`;
      expDiv.innerHTML = html;
    }

    // Update Nav Dot
    const dot = document.getElementById(`nav-dot-${qid}`);
    if (dot) {
      dot.className = `nav-dot ${isCorrect ? 'answered correct' : 'answered incorrect'}`;
      if (!isCorrect) dot.style.backgroundColor = '#ef4444';
      else dot.style.backgroundColor = '#10b981';
      dot.style.color = '#fff';
    }
  }

  // Show score
  const scoreBox = document.getElementById('postSubmitScoreContainer');
  scoreBox.style.display = 'block';
  scoreBox.innerHTML = `
    <div class="score-box">
      <h2>Kết Quả Của Bạn</h2>
      <div class="score-value">${score} / 40</div>
      <p>Kéo xuống dưới hoặc nhấp vào các ô số để xem đáp án và giải thích.</p>
    </div>
  `;

  // Inject Highlights into Left Panel
  injectHighlights(highlights);
}

function injectHighlights(highlights) {
  for (let qid in highlights) {
    const hlArr = highlights[qid];
    if (Array.isArray(hlArr)) {
      hlArr.forEach(hl => {
        const paraEl = document.getElementById(hl.paragraph_id);
        if (paraEl && hl.text) {
          // simple replacement, might need regex for exact match
          const regex = new RegExp(`(${escapeRegExp(hl.text)})`, 'gi');
          paraEl.innerHTML = paraEl.innerHTML.replace(regex, `<mark style="background-color: #fef08a; padding: 0 4px; border-radius: 4px;">$1 <sup style="color: #ef4444; font-weight: bold;">[Q${qid.replace('q','')}]</sup></mark>`);
        }
      });
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Resizer Logic ---
function setupResizer() {
  const resizer = document.getElementById('dragResizer');
  const leftSide = document.getElementById('leftPanel');
  const rightSide = document.getElementById('rightPanel');
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
    }, { once: true });
  });

  function handleMouseMove(e) {
    if (!isResizing) return;
    const containerWidth = document.getElementById('splitContainer').offsetWidth;
    // Don't let it go too far left or right
    if (e.clientX > 300 && e.clientX < containerWidth - 300) {
      const leftWidth = (e.clientX / containerWidth) * 100;
      leftSide.style.flex = `0 0 ${leftWidth}%`;
      rightSide.style.flex = `0 0 ${100 - leftWidth}%`;
    }
  }
}
