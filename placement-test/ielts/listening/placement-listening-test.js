const GAS_URL = document.body.dataset.gasUrl || 'https://script.google.com/macros/s/AKfycbz6mSuAhOl6yIEfuYYLPUvi4LAjTOTwA0t3ik5MBi515I7twRBsWNLR-2apjRwqQgPbFw/exec';
const POST_SUBMIT_DB_URL = 'https://raw.githubusercontent.com/thangbuilomo/audio-ielts/main/vault-9/explanation_key_database.json';
const POST_SUBMIT_RAW_BASE = 'https://raw.githubusercontent.com/thangbuilomo/audio-ielts/main/vault-9';

const state = {
  testId: '',
  mode: 'none', // 'guest' or 'student'
  studentData: null,

  manifest: null,
  content: null,
  questions: null,

  startTime: 0,
  violationCount: 0,
  events: [],
  answers: {},
  reviews: {},
  selectionGroups: {},
  currentPart: 1,
  isSubmitted: false,

  // Audio specific
  audioElement: null,
  audioDuration: 0,
  postAudioTimerInterval: null,
  postAudioSecondsRemaining: 0,
  isAudioFinished: false
};

const MODULE_NAME = 'Listening';
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

function partNumberForQuestionNumber(number) {
  const numeric = Number(number);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.min(4, Math.max(1, Math.ceil(numeric / 10)));
}

function getGroupPart(group) {
  const partMatch = String(group.part_id || '').match(/(\d+)/);
  if (partMatch) return Number(partMatch[1]);
  if (Array.isArray(group.question_range) && group.question_range.length) {
    return partNumberForQuestionNumber(group.question_range[0]);
  }
  const firstItem = (group.items || []).find(item => item && item.number);
  return firstItem ? partNumberForQuestionNumber(firstItem.number) : 1;
}

function getPartForQid(qid) {
  for (const group of getQuestionGroups()) {
    if ((group.items || []).some(item => getQuestionId(item) === qid)) {
      return getGroupPart(group);
    }
  }
  return partNumberForQuestionNumber(String(qid || '').match(/\d+/)?.[0]);
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

function helpContentHtml() {
  return `
    <div class="exam-help-panel">
      <div class="exam-help-title">Huong dan thao tac:</div>
      <div class="exam-help-grid">
        <div class="exam-help-card">
          <h3 style="color: var(--accent-color);">1. Highlight van ban</h3>
          <p>Boi den mot doan text bat ky va <strong>click chuot phai</strong> de hien thi bang mau highlight.</p>
          <div class="help-demo-box">
            This is a <span class="help-highlight-sample">sample text to highlight</span> in listening.
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
      desc.textContent = 'Bai luyen tap kiem tra ky nang IELTS Listening dua tren bo de Saola IELTS Actual Exam Vault 9. Audio se tu dong chay khi bat dau.';
    }
  }
  if (loginBox) loginBox.classList.add('start-auth-panel');
  if (guestBox) guestBox.classList.add('start-guest-panel');
  if (featureList) featureList.style.display = 'none';
  if (featureList && !document.getElementById('startHelpPanel')) {
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

function isPromptDrivenGroup(group) {
  const qType = group.question_type || '';
  if (!group.prompt_html || qType.includes('mcq')) return false;
  if (qType.includes('matching')) {
    return /(?:<blank|\b\d+\s*(?:[.\u2026_]{2,}))/i.test(group.prompt_html);
  }
  return qType.includes('completion') || qType.includes('labeling');
}

function usesSelectAnswers(group) {
  const qType = group.question_type || '';
  const promptText = String(group.prompt_html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return qType.includes('matching')
    || qType.includes('labeling')
    || /choose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+correct answers?/i.test(promptText)
    || (group.items || []).some(item => item.response_type === 'select');
}

function extractOptionBank(tempDiv) {
  const options = [];
  tempDiv.querySelectorAll('p').forEach(paragraph => {
    const text = paragraph.textContent.replace(/\s+/g, ' ').trim();
    const match = text.match(/^([A-Z])\s+(.+)$/);
    if (!match) return;

    options.push({
      label: match[1],
      text: match[2]
    });
    paragraph.remove();
  });
  return options;
}

function removeDuplicatePromptHeading(tempDiv) {
  const firstParagraph = tempDiv.querySelector('p');
  if (!firstParagraph) return;

  const text = firstParagraph.textContent.replace(/\s+/g, ' ').trim();
  if (/^Questions?\s+\d+/i.test(text)) {
    firstParagraph.remove();
  }
}

function makeInlineControl(qid, number, options) {
  const label = escapeHtml(number);
  const badge = number ? `<span class="inline-question-badge">${label}</span>` : '';
  if (options.length) {
    return `<span class="inline-answer-anchor" id="question-container-${qid}">
      ${badge}<select class="matching-select inline-answer-select input-element" data-qid="${qid}" aria-label="Question ${label}" onchange="saveAnswer('${qid}', this.value, this)">
        <option value="">Select</option>${buildOptionsHtml(options)}
      </select>
    </span>`;
  }

  return `<span class="inline-answer-anchor" id="question-container-${qid}">
    ${badge}<input type="text" style="min-width: 130px;" class="blank-input inline-answer-input input-element" data-qid="${qid}" aria-label="Question ${label}" placeholder="Question ${label}" oninput="saveAnswer('${qid}', this.value, this)">
  </span>`;
}

function replaceNumberedGaps(html, group, options) {
  const itemsByNumber = new Map();
  (group.items || []).forEach(item => {
    itemsByNumber.set(String(item.number), item);
  });

  const numbers = Array.from(itemsByNumber.keys())
    .sort((a, b) => Number(b) - Number(a))
    .map(number => number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!numbers.length) return html;

  const gapPattern = new RegExp(`\\b(${numbers.join('|')})\\s*(?:[.\\u2026_\\u00b7]{2,})`, 'g');
  return html.replace(gapPattern, (match, number) => {
    const item = itemsByNumber.get(number);
    const qid = getQuestionId(item);
    return makeInlineControl(qid, number, options);
  });
}

function replaceStrongNumberedGaps(html, group, options) {
  const itemsByNumber = new Map();
  (group.items || []).forEach(item => {
    itemsByNumber.set(String(item.number), item);
  });

  const numbers = Array.from(itemsByNumber.keys())
    .sort((a, b) => Number(b) - Number(a))
    .map(number => number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!numbers.length) return html;

  const gapUnit = '(?:\\\\_|[_\\.\\u2026\\u00b7])';
  const strongGapPattern = new RegExp(`<strong>\\s*'?(${numbers.join('|')})\\s*<\\/strong>\\s*(?:${gapUnit}\\s*){2,}`, 'g');

  return html.replace(strongGapPattern, (match, number) => {
    const item = itemsByNumber.get(number);
    const qid = getQuestionId(item);
    return makeInlineControl(qid, number, options);
  });
}

function getLetterRangeOptions(group, fallbackEnd = 'K') {
  const source = `${group.instruction || ''} ${group.prompt_html || ''}`;
  const rangeMatch = source.match(/\b([A-Z])\s*(?:-|–|—|&ndash;|&mdash;)\s*([A-Z])\b/i);
  const start = (rangeMatch ? rangeMatch[1] : 'A').toUpperCase().charCodeAt(0);
  const end = (rangeMatch ? rangeMatch[2] : fallbackEnd).toUpperCase().charCodeAt(0);
  const options = [];
  for (let code = start; code <= end; code++) {
    options.push({ label: String.fromCharCode(code), text: '' });
  }
  return options;
}

function extractMapLabelItems(group) {
  return (group.items || []).map(item => {
    const qid = getQuestionId(item);
    const number = item.number || getQuestionNumberFromGroup(group, qid);
    let label = '';

    const itemTemp = document.createElement('div');
    itemTemp.innerHTML = item.prompt_html || '';
    const itemStrong = itemTemp.querySelector('strong')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const itemMatch = itemStrong.match(new RegExp(`^${number}\\s+(.+)$`));
    if (itemMatch) label = itemMatch[1].trim();

    if (!label) {
      const groupTemp = document.createElement('div');
      groupTemp.innerHTML = group.prompt_html || '';
      const groupStrong = Array.from(groupTemp.querySelectorAll('strong'))
        .map(strong => strong.textContent.replace(/\s+/g, ' ').trim())
        .find(text => new RegExp(`^${number}\\s+`).test(text));
      const groupMatch = groupStrong && groupStrong.match(new RegExp(`^${number}\\s+(.+)$`));
      if (groupMatch) label = groupMatch[1].trim();
    }

    return {
      qid,
      number,
      label: label || `Question ${number}`
    };
  });
}

function isMapLetterChoiceGroup(group) {
  const qType = group.question_type || '';
  const source = `${group.instruction || ''} ${group.prompt_html || ''}`;
  return qType.includes('map_labeling') && /\bA\s*(?:-|–|—|&ndash;|&mdash;)\s*K\b/i.test(source);
}

function renderMapLetterChoiceGroup(group, tempDiv, groupBody) {
  const options = getLetterRangeOptions(group, 'K');
  const items = extractMapLabelItems(group);
  tempDiv.querySelectorAll('table').forEach(table => table.remove());

  const task = document.createElement('div');
  task.className = 'listening-task-frame listening-map-task';
  task.innerHTML = replaceBlankTags(tempDiv.innerHTML, group);

  const grid = document.createElement('div');
  grid.className = 'map-label-grid';
  grid.innerHTML = items.map(item => `
    <label class="map-label-row" id="question-container-${item.qid}">
      <span class="map-label-number">${escapeHtml(item.number)}</span>
      <span class="map-label-text">${escapeHtml(item.label)}</span>
      <select class="matching-select map-label-select input-element" data-qid="${item.qid}" aria-label="Question ${escapeHtml(item.number)}" onchange="saveAnswer('${item.qid}', this.value, this)">
        <option value="">Select</option>${buildOptionsHtml(options)}
      </select>
    </label>
  `).join('');
  task.appendChild(grid);
  groupBody.appendChild(task);

  items.forEach(item => {
    const expDiv = document.createElement('div');
    expDiv.id = `explanation-${item.qid}`;
    expDiv.style.display = 'none';
    groupBody.appendChild(expDiv);
  });
}

function formatListeningSectionHeadings(promptEl, group) {
  const qRange = Array.isArray(group.question_range) ? group.question_range.join('-') : '';
  const spaciousTest5Notes = state.testId === 'TEST_5' && qRange === '31-40';
  if (spaciousTest5Notes) promptEl.classList.add('listening-spacious-notes');

  const sectionHeadings = [
    'Types of waste',
    'Background',
    'Research centre activities',
    'Conservation and management'
  ];

  promptEl.querySelectorAll('p').forEach(paragraph => {
    const strong = paragraph.querySelector('strong');
    if (!strong) return;

    const headingText = strong.textContent.replace(/\s+/g, ' ').replace(/:$/, '').trim();
    if (!sectionHeadings.some(heading => heading.toLowerCase() === headingText.toLowerCase())) return;

    strong.classList.add('listening-section-heading');
    paragraph.classList.add('listening-section-paragraph');

    let cursor = strong.nextSibling;
    while (cursor && cursor.nodeType === Node.TEXT_NODE && !cursor.textContent.trim()) {
      cursor = cursor.nextSibling;
    }
    if (cursor && cursor.nodeName !== 'BR') {
      strong.insertAdjacentHTML('afterend', '<br>');
    }
  });
}

function textFromHtmlWithBreaks(html) {
  const temp = document.createElement('div');
  temp.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n');
  return temp.textContent || '';
}

function getFallbackMcqData(group, number) {
  const temp = document.createElement('div');
  temp.innerHTML = group.prompt_html || '';
  const paragraphs = Array.from(temp.querySelectorAll('p'));
  const numberText = String(number);
  let foundQuestion = false;
  let prompt = '';

  for (const paragraph of paragraphs) {
    const strongText = paragraph.querySelector('strong')?.textContent.replace(/\s+/g, ' ').trim() || '';
    const paragraphText = textFromHtmlWithBreaks(paragraph.innerHTML).replace(/\s+/g, ' ').trim();

    if (!foundQuestion) {
      if (strongText && new RegExp(`^${numberText}\\b`).test(strongText)) {
        prompt = strongText.replace(new RegExp(`^${numberText}\\s*`), '').trim();
        foundQuestion = true;
      }
      continue;
    }

    if (strongText && /^\d+\b/.test(strongText)) break;

    const optionLabels = ['A', 'B', 'C', 'D', 'E'];
    const optionLines = textFromHtmlWithBreaks(paragraph.innerHTML)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const options = optionLines
      .map(line => {
        const match = line.match(/^([1-5])[\.)]\s*(.+)$/);
        if (!match) return null;
        return {
          label: optionLabels[Number(match[1]) - 1],
          text: match[2]
        };
      })
      .filter(Boolean);

    if (options.length >= 2) return { prompt, options };
  }

  return { prompt, options: [] };
}

function decoratePromptContent(promptEl, group) {
  const qType = group.question_type || '';
  promptEl.classList.add('listening-task-frame');

  if (qType.includes('table')) {
    promptEl.classList.add('listening-table-task');
    promptEl.querySelectorAll('table').forEach(table => table.classList.add('listening-table'));
  } else if (qType.includes('flowchart')) {
    promptEl.classList.add('flowchart-task');
    decorateFlowchart(promptEl);
  } else {
    promptEl.classList.add('listening-notes-task');
  }

  formatListeningSectionHeadings(promptEl, group);
}

function decorateFlowchart(promptEl) {
  let inFlow = false;
  promptEl.querySelectorAll('p').forEach(paragraph => {
    const text = paragraph.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;

    if (/^[↓→]+$/.test(text)) {
      paragraph.className = 'flow-arrow';
      paragraph.textContent = '↓';
      return;
    }

    const strongText = paragraph.querySelector('strong')?.textContent.replace(/\s+/g, ' ').trim() || '';
    if (strongText && strongText === strongText.toUpperCase() && !/^Questions?/i.test(strongText)) {
      paragraph.classList.add('flow-title');
      inFlow = true;
      return;
    }

    if (inFlow) {
      paragraph.classList.add('flow-step');
    }
  });
}

function renderPromptDrivenGroup(group, groupBody) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = group.prompt_html || '';
  removeDuplicatePromptHeading(tempDiv);

  if (isMapLetterChoiceGroup(group)) {
    renderMapLetterChoiceGroup(group, tempDiv, groupBody);
    return;
  }

  const extractedOptions = usesSelectAnswers(group) ? extractOptionBank(tempDiv) : [];
  const options = usesSelectAnswers(group)
    ? normalizeOptions(group.options || group.choices || extractedOptions)
    : [];

  let html = replaceBlankTags(tempDiv.innerHTML, group);
  html = replaceStrongNumberedGaps(html, group, options);
  html = replaceNumberedGaps(html, group, options);

  const promptBlock = document.createElement('div');
  promptBlock.innerHTML = html;
  decoratePromptContent(promptBlock, group);
  groupBody.appendChild(promptBlock);

  const hasInlineOptionBank = Boolean(promptBlock.querySelector('.option-bank'));
  if (options.length && !hasInlineOptionBank) {
    const bank = document.createElement('div');
    bank.className = 'option-bank';
    bank.innerHTML = options.map(option => (
      `<div class="option-bank-item"><strong>${escapeHtml(option.label)}</strong><span>${escapeHtml(option.text)}</span></div>`
    )).join('');
    groupBody.appendChild(bank);
  }

  (group.items || []).forEach(item => {
    const qid = getQuestionId(item);
    const expDiv = document.createElement('div');
    expDiv.id = `explanation-${qid}`;
    expDiv.style.display = 'none';
    groupBody.appendChild(expDiv);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  state.testId = urlParams.get('test') || 'TEST_2';

  document.getElementById('testTitleGate').textContent = displayTestTitle();
  document.title = displayTestTitle();
  setupHelpUi();
  setupStartGate();
});

function setupStartGate() {
  const loginBtn = document.getElementById('loginBtn');
  
  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('studentEmail').value.trim();
    const password = document.getElementById('studentPassword').value.trim();
    const fullName = document.getElementById('studentFullName').value.trim();
    const phone = document.getElementById('studentPhone').value.trim();
    const realEmail = document.getElementById('studentRealEmail').value.trim();
    const errDiv = document.getElementById('loginError');

    if (!email || !password) {
      errDiv.textContent = "Vui lòng nhập đủ tài khoản và mật khẩu";
      errDiv.style.display = 'block';
      return;
    }
    if (!fullName || !phone) {
      errDiv.textContent = 'Vui lòng nhập đầy đủ Họ Tên và Số điện thoại.';
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
        // Overwrite student_name and add custom fields so they are available at submit time
        response.student_name = fullName;
        response.phone = phone;
        response.realEmail = realEmail;
        response.email = email; // use the username supplied as email
        state.studentData = response;
        state.studentData.attemptId = 'att_' + Date.now() + '_' + Math.floor(Math.random()*1000);
        
        document.getElementById('studentNameDisplay').textContent = fullName;
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
}

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

    document.getElementById('headerTestTitle').textContent = displayTestTitle();

    renderQuestions();
    setupNavigation();
    setupAudioPlayerAuto();
    setupHighlighter('.split-container');

    state.startTime = Date.now();

    if (state.mode === 'student') {
      setupAntiCheat();
    }

    setupResizer();

  } catch(e) {
    alert("Lỗi tải dữ liệu bài test: " + e.message);
  }
}

// --- Audio Logic ---
function setupAudioPlayer() {
  const audioCfg = state.content.audio;
  const audioUrl = audioCfg.src || audioCfg.local_src;

  state.audioElement = new Audio(audioUrl);

  const playBtn = document.getElementById('audioPlayBtn');
  const fill = document.getElementById('audioProgressFill');
  const timeDisplay = document.getElementById('audioTimeDisplay');
  const timerDisplay = document.getElementById('timerDisplay');

  timerDisplay.textContent = "Audio Loading...";

  state.audioElement.addEventListener('loadedmetadata', () => {
    state.audioDuration = state.audioElement.duration;
    updateTimeDisplay(0, state.audioDuration);
    timerDisplay.textContent = "Ready";
  });

  state.audioElement.addEventListener('timeupdate', () => {
    const curr = state.audioElement.currentTime;
    const pct = (curr / state.audioDuration) * 100;
    fill.style.width = `${pct}%`;
    updateTimeDisplay(curr, state.audioDuration);
  });

  state.audioElement.addEventListener('ended', () => {
    state.isAudioFinished = true;
    playBtn.textContent = '■';
    playBtn.disabled = true;
    startPostAudioCountdown(audioCfg.post_audio_review_seconds || 180);
  });

  playBtn.addEventListener('click', () => {
    if (state.isAudioFinished || state.isSubmitted) return;

    if (state.audioElement.paused) {
      state.audioElement.play();
      playBtn.textContent = '⏸';

      // If config says allow_pause is false, disable the button after playing
      if (audioCfg.allow_pause === false) {
        playBtn.disabled = true;
        playBtn.style.opacity = '0.5';
      }
      timerDisplay.textContent = "Playing";
    } else {
      if (audioCfg.allow_pause !== false) {
        state.audioElement.pause();
        playBtn.textContent = '▶';
        timerDisplay.textContent = "Paused";
      }
    }
  });
}

function updateTimeDisplay(current, total) {
  const format = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  document.getElementById('audioTimeDisplay').textContent = `${format(current)} / ${format(total)}`;
}

function setupAudioPlayerAuto() {
  const audioCfg = state.content.audio || {};
  const audioUrl = audioCfg.src || audioCfg.local_src;
  const playBtn = document.getElementById('audioPlayBtn');
  const fill = document.getElementById('audioProgressFill');
  const timerDisplay = document.getElementById('timerDisplay');
  const player = document.querySelector('.audio-player-container');

  state.audioElement = new Audio(audioUrl);
  state.audioElement.preload = 'auto';

  if (player) player.classList.add('time-only');
  if (playBtn) {
    playBtn.hidden = true;
    playBtn.disabled = true;
  }

  if (timerDisplay) {
    timerDisplay.textContent = '';
    timerDisplay.hidden = true;
  }
  updateTimeDisplay(0, 0);

  const attemptAutoPlay = () => {
    if (state.isAudioFinished || state.isSubmitted || !state.audioElement.paused) return;
    const playPromise = state.audioElement.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
        .then(() => {
          if (timerDisplay) timerDisplay.hidden = true;
        })
        .catch(() => {
          if (timerDisplay) {
            timerDisplay.textContent = 'Click page';
            timerDisplay.hidden = false;
          }
          document.addEventListener('click', () => {
            state.audioElement.play().then(() => {
              if (timerDisplay) timerDisplay.hidden = true;
            }).catch(() => {});
          }, { once: true });
        });
    }
  };

  state.audioElement.addEventListener('loadedmetadata', () => {
    state.audioDuration = state.audioElement.duration || 0;
    updateTimeDisplay(0, state.audioDuration);
    attemptAutoPlay();
  });

  state.audioElement.addEventListener('timeupdate', () => {
    const current = state.audioElement.currentTime || 0;
    const pct = state.audioDuration ? (current / state.audioDuration) * 100 : 0;
    if (fill) fill.style.width = `${pct}%`;
    updateTimeDisplay(current, state.audioDuration || 0);
  });

  state.audioElement.addEventListener('ended', () => {
    state.isAudioFinished = true;
    startPostAudioCountdown(audioCfg.post_audio_review_seconds || 180);
  });

  attemptAutoPlay();
}

function startPostAudioCountdown(seconds) {
  state.postAudioSecondsRemaining = seconds;
  const display = document.getElementById('timerDisplay');
  if (display) display.hidden = false;

  state.postAudioTimerInterval = setInterval(() => {
    if (state.isSubmitted) {
      clearInterval(state.postAudioTimerInterval);
      return;
    }

    state.postAudioSecondsRemaining--;

    if (state.postAudioSecondsRemaining <= 0) {
      clearInterval(state.postAudioTimerInterval);
      display.textContent = "00:00";
      logEvent('AUTO_SUBMIT', 'Post-audio timer expired');
      submitTest();
    } else {
      const m = Math.floor(state.postAudioSecondsRemaining / 60).toString().padStart(2, '0');
      const s = (state.postAudioSecondsRemaining % 60).toString().padStart(2, '0');
      display.textContent = `Check: ${m}:${s}`;
      display.style.color = '#ef4444';
    }
  }, 1000);
}

// --- Questions Rendering ---
function renderQuestions() {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';

  const groups = getQuestionGroups();
  if (!groups.length) {
    console.error('No question_groups found in state.questions');
    return;
  }

  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'question-group-card';
    card.dataset.part = String(getGroupPart(group));
    const qType = group.question_type || '';
    const promptDriven = isPromptDrivenGroup(group);

    let html = `<h3>Questions ${group.question_range ? group.question_range.join(' - ') : ''}</h3>`;
    if (group.instruction && !promptDriven) {
      html += `<div class="instruction-box">${group.instruction}</div>`;
    }

    if (promptDriven) {
      const groupBody = document.createElement('div');
      groupBody.innerHTML = html;
      renderPromptDrivenGroup(group, groupBody);
      card.appendChild(groupBody);
      container.appendChild(card);
      return;
    }

    // Process <blank> tags in prompt_html
    if (group.prompt_html && !qType.includes('mcq')) {
      let processedPrompt = replaceBlankTags(group.prompt_html, group);
      html += `<div class="prompt-box">${processedPrompt}</div>`;
    }

    const groupBody = document.createElement('div');
    groupBody.innerHTML = html;

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
          let optionsHtml = '<option value="">Select</option>';
          optionsHtml += buildOptionsHtml(q.options || group.options || group.choices || []);
          qHtml += `${itemText} <select style="margin-left: 8px;" class="matching-select input-element" data-qid="${qid}" onchange="saveAnswer('${qid}', this.value, this)">${optionsHtml}</select>`;
        }
        else if (qType.includes('mcq')) {
          const fallbackMcq = getFallbackMcqData(group, q.number);
          const promptText = fallbackMcq.prompt ? escapeHtml(fallbackMcq.prompt) : itemText;
          qHtml += `${promptText}<div style="margin-top: 10px;">`;
          const opts = q.options || group.options || fallbackMcq.options || [];
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

  updatePartVisibility();
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

function setupNavigation() {
  const nav = document.getElementById('navigationBar');
  nav.classList.add('listening-navigation-bar');
  nav.innerHTML = '';

  const partNav = document.createElement('div');
  partNav.className = 'part-switcher';
  for (let part = 1; part <= 4; part++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'part-tab';
    btn.dataset.part = String(part);
    btn.textContent = `Part ${part}`;
    btn.onclick = () => setCurrentPart(part);
    partNav.appendChild(btn);
  }

  const statusNav = document.createElement('div');
  statusNav.className = 'question-status-nav';

  let qNum = 1;
  getQuestionGroups().forEach(group => {
    if (group.items) {
      group.items.forEach(q => {
        const qid = getQuestionId(q);
        const dot = document.createElement('div');
        dot.className = 'nav-dot';
        dot.textContent = q.number || qNum++;
        dot.id = `nav-dot-${qid}`;
        dot.onclick = () => {
          if (!state.isSubmitted) {
            state.reviews[qid] = !state.reviews[qid];
            updateNavDots();
          }
          setCurrentPart(getPartForQid(qid), { scrollQid: qid });
        };
        statusNav.appendChild(dot);
      });
    }
  });

  nav.appendChild(partNav);
  nav.appendChild(statusNav);
  updatePartVisibility();
  updateNavDots();
}

function setCurrentPart(part, options = {}) {
  state.currentPart = Math.min(4, Math.max(1, Number(part) || 1));
  updatePartVisibility();
  if (!state.isSubmitted) updateNavDots();

  if (options.scrollQid) {
    const inlineControl = document.querySelector(`[data-qid="${options.scrollQid}"]`);
    const el = inlineControl ? (inlineControl.closest('.inline-answer-anchor') || inlineControl.closest('.map-label-row') || inlineControl) : document.getElementById(`question-container-${options.scrollQid}`);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({behavior: 'smooth', block: 'center'}));
    }
  } else {
    const rightPanel = document.getElementById('rightPanel');
    if (rightPanel) rightPanel.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function updatePartVisibility() {
  document.querySelectorAll('.question-group-card[data-part]').forEach(card => {
    card.style.display = Number(card.dataset.part) === state.currentPart ? '' : 'none';
  });

  document.querySelectorAll('.part-tab').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.part) === state.currentPart);
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
  clearInterval(state.postAudioTimerInterval);
  if (state.audioElement && !state.audioElement.paused) {
    state.audioElement.pause();
  }

  document.getElementById('loadingModal').style.display = 'flex';
  document.querySelectorAll('.input-element').forEach(el => el.disabled = true);

  try {
    const basePath = `data/${state.testId}/`;
    const feedback = await loadPostSubmitFeedback(basePath);

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
      <p>KÃ©o sang pháº§n Tapescript (Transcript) bÃªn trÃ¡i Ä‘á»ƒ xem pháº§n Ä‘á»c, hoáº·c cuá»™n xuá»‘ng xem giáº£i thÃ­ch.</p>
    </div>
  `;
  scoreBox.querySelector('h2').textContent = 'Your Result';
  scoreBox.querySelector('p').textContent = 'Use the transcript panel on the left, or scroll down to review answers and explanations.';

  document.getElementById('rightPanel').style.width = '50%';
  document.getElementById('leftPanel').style.width = '50%';
  document.getElementById('leftPanel').style.display = 'block';
  document.getElementById('leftPanel').style.padding = '';
  document.getElementById('dragResizer').style.display = 'block';

  injectTranscript(highlights);

  // Send result to GAS
  if (state.mode === 'student') {
    const payload = {
      type: 'listening_submit',
      test_id: state.testId,
      attempt_id: state.studentData.attemptId || '',
      username: state.studentData.email,
      student_name: state.studentData.student_name,
      phone: state.studentData.phone,
      real_email: state.studentData.realEmail,
      score: score,
      correct_answers: score,
      total_questions: scoreMax,
      responses: state.answers,
      violation_count: state.violationCount,
      submit_reason: 'user_submit'
    };

    fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(e => console.error("Error sending to GAS:", e));
  }
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

function processFeedback(feedback) {
  const answerKey = feedback.json_key || {};
  const highlights = feedback.highlight_json || {};
  const explanations = feedback.explanation_json || null;

  let score = 0;

  for (let qid in answerKey) {
    const keyData = answerKey[qid];
    const userAns = (state.answers[qid] || '').toString().toLowerCase().trim();

    let isCorrect = false;
    let correctStr = "";

    if (Array.isArray(keyData)) {
      isCorrect = keyData.some(k => k.toString().toLowerCase().trim() === userAns);
      correctStr = keyData.join(" OR ");
    } else {
      isCorrect = keyData.toString().toLowerCase().trim() === userAns;
      correctStr = keyData;
    }

    if (isCorrect) score++;

    const inputEl = document.querySelector(`[data-qid="${qid}"]`);
    if (inputEl) {
      inputEl.classList.add(isCorrect ? 'correct' : 'incorrect');
    }

    if (userAns) {
      const checkedEl = document.querySelector(`input[name="q_${qid}"]:checked`);
      if (checkedEl) {
         checkedEl.parentElement.classList.add(isCorrect ? 'correct' : 'incorrect');
      }
    }

    const expDiv = document.getElementById(`explanation-${qid}`);
    if (expDiv) {
      expDiv.style.display = 'block';
      let html = `<div class="review-card ${isCorrect ? 'correct' : 'incorrect'}">
        <div class="review-meta">
          <span class="review-badge ${isCorrect ? 'correct' : 'incorrect'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
          <span>Your answer: <code>${userAns || '(Trống)'}</code></span>
          <span class="review-answer-key">Correct answer: <code>${correctStr}</code></span>
        </div>`;

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
      <p>Kéo sang phần Tapescript (Transcript) bên trái để xem phần đọc, hoặc cuộn xuống xem giải thích.</p>
    </div>
  `;

  // Enable split layout
  document.getElementById('rightPanel').style.width = '50%';
  document.getElementById('leftPanel').style.width = '50%';
  document.getElementById('leftPanel').style.display = 'block';
  document.getElementById('dragResizer').style.display = 'block';

  injectTranscript(highlights);
}

function injectTranscript(highlights) {
  const container = document.getElementById('transcriptContainer');
  let html = '<h2>Tapescript (Transcript)</h2>';

  if (highlights.parts && Array.isArray(highlights.parts)) {
    highlights.parts.forEach(part => {
      html += `<h3>${part.title}</h3>`;
      if (part.annotated_transcript_html) {
        const transcriptHtml = stripTranscriptBold(part.annotated_transcript_html);
        html += `<div style="line-height: 1.6; font-size: 1.05rem;">${transcriptHtml}</div>`;
      }
    });
  } else {
    html += '<p>Không có Transcript được lưu cho bài này.</p>';
  }

  container.innerHTML = html;
}

function stripTranscriptBold(html) {
  return String(html || '').replace(/<\/?(?:strong|b)\b[^>]*>/gi, '');
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
