const params = new URLSearchParams(window.location.search);
const MODULE = params.get('module') || window.SAOLA_EXERCISE_MODULE || 'listening';
const DATA_BASE = params.get('dataBase') || window.SAOLA_EXERCISE_DATA_BASE || `data/${MODULE}/`;
const MIN_SUBMIT_RATIO = 0.4;

document.addEventListener('DOMContentLoaded', () => {
  const exerciseId = params.get('id');

  if (!exerciseId) {
    document.getElementById('question-content').innerHTML = '<p>No exercise ID provided.</p>';
    return;
  }

  loadExercise(exerciseId);
  document.getElementById('btn-submit').addEventListener('click', submitAnswers);
});

let currentExercise = null;
let currentAnswerKeyRoot = null;
let currentExplanationsRoot = null;
let currentTranscriptRoot = null;
let timerInterval = null;
let hasSubmitted = false;
let reviewedQuestions = {};

async function loadExercise(id) {
  try {
    currentExercise = await fetchJson(resolveDataUrl(`${id}.json`));
    document.getElementById('ex-title').textContent = currentExercise.title || id;
    document.title = `${currentExercise.title || id} - Saola`;

    setupAudio(currentExercise);
    setupTimer(currentExercise);
    renderExercise(currentExercise);
    await setupExerciseNavigation(id);
  } catch (err) {
    console.error(err);
    document.getElementById('question-content').innerHTML = '<p>Error loading exercise data.</p>';
  }
}

async function setupExerciseNavigation(id) {
  try {
    const catalog = await fetchJson(resolveDataUrl('catalog.json'));
    let currentCategory = null;
    let currentIndex = -1;
    
    for (const category of catalog.categories) {
      const index = category.exercises.findIndex(ex => ex.id === id);
      if (index !== -1) {
        currentCategory = category;
        currentIndex = index;
        break;
      }
    }
    
    if (currentCategory) {
      const backLink = document.getElementById('back-link');
      if (backLink) {
        backLink.href = `index.html?module=${encodeURIComponent(MODULE)}#category-${currentCategory.category_id}`;
      }
      
      const headerPrev = document.getElementById('header-nav-prev');
      const headerNext = document.getElementById('header-nav-next');
      
      if (currentIndex > 0 && headerPrev) {
        const prevEx = currentCategory.exercises[currentIndex - 1];
        headerPrev.href = `run.html?id=${prevEx.id}&module=${MODULE}`;
        headerPrev.style.visibility = 'visible';
      }
      
      if (currentIndex < currentCategory.exercises.length - 1 && headerNext) {
        const nextEx = currentCategory.exercises[currentIndex + 1];
        headerNext.href = `run.html?id=${nextEx.id}&module=${MODULE}`;
        headerNext.style.visibility = 'visible';
      }
    }
  } catch (err) {
    console.warn("Could not load catalog for navigation:", err);
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.json();
}

function resolveDataUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, new URL(DATA_BASE, window.location.href)).toString();
}

function setupAudio(data) {
  const audioSrc = data.audio?.src || data.audio_url;
  const audio = document.getElementById('audio-player');
  if (!audioSrc || !audio) return;

  audio.src = /^https?:\/\//i.test(audioSrc) ? audioSrc : new URL(audioSrc, window.location.href).toString();
  audio.style.display = 'block';
}

function setupTimer(data) {
  const duration = Number(data.duration_seconds || 0);
  const timer = document.getElementById('timer');
  if (!timer) return;

  if (timerInterval) clearInterval(timerInterval);

  if (!duration) {
    let elapsed = 0;
    timer.textContent = formatTime(elapsed);
    timerInterval = setInterval(() => {
      elapsed += 1;
      timer.textContent = formatTime(elapsed);
    }, 1000);
    return;
  }

  let timeLeft = duration;
  timer.textContent = formatTime(timeLeft);
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    timer.textContent = formatTime(Math.max(timeLeft, 0));
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitAnswers();
    }
  }, 1000);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function getGroups(data) {
  if (Array.isArray(data.parts)) {
    return data.parts.flatMap(part => {
      const groups = Array.isArray(part.groups) ? part.groups : [];
      return groups.map(group => ({ ...group, part_id: group.part_id || part.part_id }));
    });
  }

  if (Array.isArray(data.question_groups)) {
    return data.question_groups.map(group => ({
      ...group,
      question_type: group.question_type || group.type,
    }));
  }

  return [];
}

function getAnswerKey() {
  if (!currentAnswerKeyRoot) return {};
  return currentAnswerKeyRoot.answer_key || currentAnswerKeyRoot;
}

function getQid(item) {
  return item.question_id || item.id;
}

function getQuestionNumber(item, qid) {
  if (Number.isFinite(Number(item.number))) return Number(item.number);
  const match = String(qid || '').match(/^q(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function qidNumber(qid) {
  const match = String(qid || '').match(/^q(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function getAnswers(qid) {
  const entry = getAnswerKey()[qid] || {};
  return entry.answers || entry.accepted || [];
}

function getExplanation(qid) {
  const explanations = currentExplanationsRoot?.explanations || currentExplanationsRoot || {};
  const entry = explanations[qid] || {};
  return {
    explanation: entry.explanation || entry.explanation_html || '',
    evidence: entry.evidence || '',
  };
}

function itemsForGroup(group) {
  const rawItems = Array.isArray(group.items) ? group.items : [];
  return rawItems
    .map(item => {
      const qid = getQid(item);
      return {
        ...item,
        question_id: qid,
        number: getQuestionNumber(item, qid),
      };
    })
    .filter(item => item.question_id);
}

function renderExercise(data) {
  const groups = getGroups(data);
  const content = document.getElementById('question-content');

  if (!groups.length) {
    content.innerHTML = `
      <div class="empty-state-box" style="text-align: center; padding: 50px 20px; background: #fff; border-radius: 8px; margin: 20px 0;">
        <img src="../assets/images/logo icon.png" alt="Saola Logo" style="height: 64px; width: auto; margin-bottom: 20px; opacity: 0.9;">
        <h3 style="color: #1e3a8a; font-size: 1.25rem; margin: 0 0 8px; font-weight: 800;">Bài tập sẽ được bổ sung sớm trong thời gian tới.</h3>
        <p style="color: #475569; margin: 0 0 12px; font-size: 1rem; font-weight: 500;">Vui lòng làm các bài tập tiếp theo.</p>
        <p style="color: #64748b; margin: 0; font-size: 0.95rem; font-style: italic;">Exercises will be added soon. Please proceed to the next exercises.</p>
      </div>
    `;
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) btnSubmit.style.display = 'none';
    return;
  }

  const groupsHtml = groups.map(group => renderGroup(group)).join('');
  const passageHtml = data.content?.content_html || data.passage_html || '';
  const isReading = data.module === 'reading' || MODULE === 'reading';
  const isListening = data.module === 'listening' || MODULE === 'listening';
  const passageAlreadyHasHeading = /<h[12]\b/i.test(passageHtml);

  if (isReading && passageHtml) {
    document.body.classList.add('test-engine-theme', 'exercise-practice-page', 'reading-exercise-page');
    document.body.classList.remove('listening-exercise-page');
    document.querySelector('.runner-header')?.classList.add('test-header');
    document.querySelector('.runner-container')?.classList.add('reading-runner-container');
    document.getElementById('openHelpBtn')?.removeAttribute('hidden');
    const submitButton = document.getElementById('btn-submit');
    const runnerActions = document.querySelector('.runner-actions');
    if (submitButton) {
      submitButton.classList.add('submit-btn', 'module-submit-btn', 'reading-submit-btn');
      if (window.innerWidth > 900 && runnerActions && submitButton.parentElement !== runnerActions) {
        submitButton.classList.remove('mobile-bottom-submit', 'mobile-nav-submit');
        runnerActions.appendChild(submitButton);
      }
    }
    
    content.className = 'split-container';
    
    content.innerHTML = `
      <div class="left-panel" id="leftPanel" style="width: 50%;">
        <div id="passagesContentContainer">
          <div class="passage-content active">
            ${data.content?.title && !passageAlreadyHasHeading ? `<h2>${escapeHtml(data.content.title)}</h2>` : ''}
            ${passageHtml}
          </div>
        </div>
      </div>
      <div class="resizer" id="dragResizer"></div>
      <div class="right-panel" id="rightPanel" style="width: 50%; padding-bottom: 40px;">
        <div id="questionsContainer">
          ${groupsHtml}
        </div>
      </div>
    `;
    
    // Attach event listeners for inputs to update the bottom nav bar
    setTimeout(() => {
      setupPassageFontControls();
      setupHighlighter('.split-container');
      setupResizer();
      setupMcqControls();
      renderBottomNavigation();
      setupExerciseHelp();
      
      const onScroll = (e) => {
        if (window.innerWidth > 900) return;
        const st = e.target.scrollTop;
        const titleRow = document.querySelector('.runner-title-row');
        const logo = document.querySelector('.runner-logo');
        if (st > 30) {
          if (titleRow) titleRow.classList.add('mobile-scroll-hidden');
          if (logo) logo.classList.add('mobile-scroll-hidden');
        } else if (st === 0) {
          if (titleRow) titleRow.classList.remove('mobile-scroll-hidden');
          if (logo) logo.classList.remove('mobile-scroll-hidden');
        }
      };
      document.getElementById('leftPanel').addEventListener('scroll', onScroll);
      document.getElementById('rightPanel').addEventListener('scroll', onScroll);
      
      
      const inputs = document.querySelectorAll('.ex-input');
      inputs.forEach(input => {
        input.addEventListener('input', updateNavDots);
        input.addEventListener('change', updateNavDots);
      });
    }, 50);
    return;
  }

  content.classList.remove('reading-shell');
  content.innerHTML = groupsHtml;
  setupMcqControls();
  
  if (isListening) {
    document.body.classList.add('test-engine-theme', 'exercise-practice-page', 'listening-exercise-page');
    document.body.classList.remove('reading-exercise-page');
    document.querySelector('.runner-header')?.classList.add('test-header');
    document.querySelector('.runner-container')?.classList.add('listening-runner-container');
    document.getElementById('btn-submit')?.classList.add('submit-btn', 'module-submit-btn', 'listening-submit-btn');
    document.getElementById('openHelpBtn')?.removeAttribute('hidden');
    setTimeout(() => {
      setupHighlighter('.runner-container');
      setupExerciseHelp();
      renderBottomNavigation();
      
      const inputs = document.querySelectorAll('.ex-input');
      inputs.forEach(input => {
        input.addEventListener('input', updateNavDots);
        input.addEventListener('change', updateNavDots);
      });
    }, 50);
  }
}

// --- Reading UI Features ---

function setupPassageFontControls() {
  const leftPanel = document.getElementById('leftPanel');
  const content = document.getElementById('passagesContentContainer');
  if (!leftPanel || !content || document.getElementById('passageToolbar')) return;

  let size = window.innerWidth <= 900 ? 0.86 : 1.04;
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
  applySize(); // initialize default size immediately

  document.getElementById('fontSmallerBtn').onclick = () => {
    size = Math.max(0.60, size - 0.06);
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

function exerciseHelpHtml() {
  return `
    <div class="exam-help-panel">
      <div class="exam-help-title">Test tools</div>
      <div class="exam-help-grid">
        <div class="exam-help-card">
          <h3 style="color: var(--accent-color);">1. Highlight text</h3>
          <p>Select text, then right-click to choose a highlight color.</p>
          <div class="help-demo-box">
            This is a <span class="help-highlight-sample">sample text to highlight</span> during the test.
            <div class="help-color-menu">
              <span class="help-color-dot" style="background:#fef08a; border-color:#facc15;"></span>
              <span class="help-color-dot" style="background:#bbf7d0; border-color:#86efac;"></span>
              <span class="help-color-dot" style="background:#fbcfe8; border-color:#f9a8d4;"></span>
            </div>
          </div>
        </div>
        <div class="exam-help-card">
          <h3 style="color: var(--review-color);">2. Mark for review</h3>
          <p>Click a question number in the bottom bar to mark it for review.</p>
          <div class="help-review-demo">
            <span class="help-review-dot answered">12</span>
            <span class="help-review-dot review">13</span>
            <span class="help-review-dot">14</span>
          </div>
        </div>
        <div class="exam-help-card">
          <h3 style="color: #059669;">3. Mobile Layout Controls</h3>
          <p>You can scroll the <strong>Reading Passage</strong> and <strong>Questions</strong> independently. Drag the <strong>horizontal bar</strong> between them to adjust their sizes.</p>
        </div>
      </div>
    </div>
  `;
}

function setupExerciseHelp() {
  const openBtn = document.getElementById('openHelpBtn');
  if (!openBtn) return;

  if (!document.getElementById('exerciseHelpModal')) {
    const modal = document.createElement('div');
    modal.id = 'exerciseHelpModal';
    modal.className = 'start-gate-overlay';
    modal.style.display = 'none';
    modal.style.zIndex = '3005';
    modal.innerHTML = `
      <div class="help-modal-card">
        <div class="help-modal-header">
          <h2>Test tools</h2>
          <button class="close-help-btn" id="closeHelpBtn" type="button" aria-label="Close help">x</button>
        </div>
        <div>${exerciseHelpHtml()}</div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const modal = document.getElementById('exerciseHelpModal');
  const closeBtn = document.getElementById('closeHelpBtn');
  openBtn.onclick = () => { modal.style.display = 'flex'; };
  if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', event => {
    if (event.target === modal) modal.style.display = 'none';
  });
}

function setupResizer() {
  const resizer = document.getElementById('dragResizer');
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');
  const container = document.getElementById('question-content');
  if (!resizer || !leftPanel || !rightPanel || !container) return;

  let isDragging = false;
  
  const startDrag = (e) => {
    isDragging = true;
    document.body.style.cursor = window.innerWidth <= 900 ? 'row-resize' : 'col-resize';
    leftPanel.style.userSelect = 'none';
    rightPanel.style.userSelect = 'none';
  };
  
  resizer.addEventListener('mousedown', startDrag);
  resizer.addEventListener('touchstart', startDrag, {passive: true});

  const onDrag = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const containerRect = container.getBoundingClientRect();
    const isMobile = window.innerWidth <= 900;
    
    if (isMobile) {
      let newTopHeight = ((clientY - containerRect.top) / containerRect.height) * 100;
      if (newTopHeight < 15) newTopHeight = 15;
      if (newTopHeight > 85) newTopHeight = 85;
      leftPanel.style.height = `${newTopHeight}%`;
      leftPanel.style.flex = `0 0 ${newTopHeight}%`;
      rightPanel.style.height = `${100 - newTopHeight}%`;
      rightPanel.style.flex = `1 1 auto`;
      leftPanel.style.width = '';
      rightPanel.style.width = '';
    } else {
      let newLeftWidth = ((clientX - containerRect.left) / containerRect.width) * 100;
      if (newLeftWidth < 20) newLeftWidth = 20;
      if (newLeftWidth > 80) newLeftWidth = 80;
      leftPanel.style.width = `${newLeftWidth}%`;
      leftPanel.style.flex = '';
      leftPanel.style.height = '';
      rightPanel.style.width = `${100 - newLeftWidth}%`;
      rightPanel.style.flex = '';
      rightPanel.style.height = '';
    }
  };

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('touchmove', onDrag, {passive: false});

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      leftPanel.style.userSelect = '';
      rightPanel.style.userSelect = '';
    }
  };
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchend', stopDrag);
}

function renderBottomNavigation() {
  const nav = document.getElementById('navigationBar');
  if (!nav) return;
  
  const inputs = Array.from(document.querySelectorAll('.ex-input'));
  if (!inputs.length) {
    nav.style.display = 'none';
    return;
  }
  
  nav.style.display = 'flex';
  let html = '<div class="nav-questions">';
  
  inputs.forEach((input) => {
    const qid = input.dataset.qid;
    const number = input.getAttribute('placeholder') || qidNumber(qid) || qid;
    html += `<button type="button" class="nav-dot" data-nav-target="${qid}">${escapeHtml(String(number))}</button>`;
  });
  
  html += '</div>';
  nav.innerHTML = html;
  
  if (window.innerWidth <= 900) {
    const btnSubmit = document.getElementById('btn-submit');
    if (btnSubmit) {
      btnSubmit.classList.add('mobile-nav-submit');
      nav.appendChild(btnSubmit);
    }
  }
  
  nav.querySelectorAll('.nav-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const targetId = dot.dataset.navTarget;
      reviewedQuestions[targetId] = !reviewedQuestions[targetId];
      updateNavDots();
      const targetEl = document.getElementById(`input-${targetId}`) || document.querySelector(`[data-qid="${targetId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.focus();
      }
    });
  });
  
  updateNavDots();
}

function updateNavDots() {
  const nav = document.getElementById('navigationBar');
  if (!nav) return;
  
  document.querySelectorAll('.ex-input').forEach(input => {
    const qid = input.dataset.qid;
    const dot = nav.querySelector(`.nav-dot[data-nav-target="${qid}"]`);
    if (dot) {
      dot.classList.toggle('review', Boolean(reviewedQuestions[qid]));
      if (String(input.value || '').trim()) {
        dot.classList.add('answered');
      } else {
        dot.classList.remove('answered');
      }
    }
  });
}

function renderGroup(group) {
  if (isMcqGroup(group)) {
    return renderMcqGroup(group);
  }

  if (isMatchingInformationGroup(group)) {
    return renderMatchingInformationGroup(group);
  }

  if (isNoteSummaryGroup(group)) {
    return renderNoteSummaryGroup(group);
  }

  const boundQids = new Set();
  const items = itemsForGroup(group);
  const itemMap = new Map(items.map(item => [item.question_id, item]));
  const prompt = renderPromptHtml(group.prompt_html || '', boundQids, itemMap, group, items);
  const controls = renderLooseControls(group, boundQids, items);
  const groupClasses = ['question-group'];
  const promptClasses = ['prompt-content'];
  if (isDiagramLabellingGroup(group)) {
    groupClasses.push('diagram-labelling-group');
    promptClasses.push('diagram-labelling-prompt');
  }
  if (isMapLabellingGroup(group)) {
    groupClasses.push('map-labelling-group');
  }
  const showTableCompletionWarning = isTableCompletionGroup(group);
  if (showTableCompletionWarning) {
    groupClasses.push('table-completion-group');
  }

  return `
    <section class="${groupClasses.join(' ')}">
      ${group.instruction ? `<p class="group-instruction">${escapeHtml(group.instruction)}</p>` : ''}
      ${showTableCompletionWarning ? '<p class="table-completion-warning">Because of the design of table-completion questions, you should complete this exercise on a desktop computer, laptop, or tablet for the best experience.</p>' : ''}
      <div class="${promptClasses.join(' ')}">
        ${prompt}
        ${controls}
      </div>
    </section>
  `;
}

function isMcqGroup(group) {
  return /(^|_)mcq|multiple_choice/i.test(String(group.question_type || group.type || ''));
}

function isMatchingInformationGroup(group) {
  const category = String(group.category_id || currentExercise?.category_id || currentExercise?.focus_type || '').toLowerCase();
  const title = String(currentExercise?.title || '').toLowerCase();
  return category.includes('matching_information') || title.includes('matching information to categories');
}

function isNoteSummaryGroup(group) {
  return /(note|summary)_completion/i.test(String(group.question_type || group.type || group.category_id || group.focus_type || ''));
}

function isDiagramLabellingGroup(group) {
  const value = [
    group.question_type,
    group.type,
    group.category_id,
    group.focus_type,
    currentExercise?.category_id,
    currentExercise?.focus_type,
  ].join(' ').toLowerCase();
  return value.includes('diagram_labelling');
}

function isMapLabellingGroup(group) {
  const value = [
    group.question_type,
    group.type,
    group.category_id,
    group.focus_type,
    currentExercise?.category_id,
    currentExercise?.focus_type,
  ].join(' ').toLowerCase();
  return value.includes('map_labelling');
}

function isTableCompletionGroup(group) {
  const value = [
    group.question_type,
    group.type,
    group.category_id,
    group.focus_type,
    currentExercise?.category_id,
    currentExercise?.focus_type,
  ].join(' ').toLowerCase();
  return value.includes('table_completion');
}

function renderMatchingInformationGroup(group) {
  const items = itemsForGroup(group);
  const model = buildMatchingInformationModel(group, items);

  return `
    <section class="question-group matching-info-group">
      ${group.instruction ? `<p class="group-instruction">${escapeHtml(group.instruction)}</p>` : ''}
      <div class="prompt-content matching-info-prompt">
        <h1>${escapeHtml(model.title)}</h1>
        ${model.introHtml}
        ${model.options.length ? renderMatchingOptionBank(model.options) : ''}
        ${model.rowHeading ? `<div class="matching-info-row-heading">${escapeHtml(model.rowHeading)}</div>` : ''}
        <div class="matching-info-question-list">
          ${model.rows.map(row => `
            <label class="matching-info-question-row">
              ${renderControl(row.item, { ...group, options: model.options })}
              <span class="matching-info-question-text">${escapeHtml(row.text)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function buildMatchingInformationModel(group, items) {
  const promptHtml = String(group.prompt_html || '');
  const protectedPrompt = protectBlankTags(promptHtml);
  const nodes = promptNodes(protectedPrompt);
  const options = matchingOptionsForGroup(group, nodes);
  const rows = matchingQuestionRows(protectedPrompt, nodes, items);

  return {
    title: matchingDisplayTitle(promptHtml),
    introHtml: matchingIntroHtml(nodes, items, options),
    options,
    rowHeading: matchingRowHeading(nodes, rows),
    rows,
  };
}

function matchingDisplayTitle(promptHtml) {
  const number = String(currentExercise?.exercise_id || '').match(/_(\d+)$/)?.[1]
    || String(currentExercise?.title || '').match(/Exercise\s+(\d+)/i)?.[1]
    || String(promptHtml || '').match(/MATCHING INFORMATION TO CATEGORIES\s+(\d+)/i)?.[1]
    || '';
  return `Matching Information To Categories${number ? ` ${number}` : ''}`;
}

function matchingOptionsForGroup(group, nodes) {
  const explicit = normalizeOptions(group.options || group.choices);
  const parsed = matchingOptionsFromNodes(nodes);
  const options = parsed.length >= 2 ? parsed : explicit;
  return dedupeOptions(options.map(option => ({
    label: cleanMatchingText(option.label).trim(),
    text: cleanMatchingText(option.text).trim(),
  })));
}

function matchingOptionsFromNodes(nodes) {
  const options = [];
  nodes.forEach(node => {
    if (node.nodeType !== 1) return;
    if (node.matches('h1')) return;

    const candidates = [];
    if (node.matches('ul,ol')) {
      candidates.push(...Array.from(node.querySelectorAll('li')).map(li => nodeText(li)));
    } else if (
      node.matches('.options-box')
      || node.matches('table')
      || node.querySelector('strong')
      || /\b[A-Z]\s*[-.)]\s+/.test(nodeText(node))
    ) {
      candidates.push(...textLines(node));
    }

    candidates.forEach(line => {
      const option = optionFromLine(line);
      if (option) options.push(option);
    });
  });
  return options;
}

function textLines(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return String(clone.textContent || '')
    .split(/\n|\|/)
    .map(cleanMatchingText)
    .filter(Boolean);
}

function optionFromLine(line) {
  const text = cleanMatchingText(line).replace(/^\|+|\|+$/g, '').trim();
  if (/^(Questions?|Choose|Write|What|Which|Match|In which)\b/i.test(text)) return null;
  const match = text.match(/^([A-Z])(?:\s*[-.)]\s*|\s+)(.+)$/);
  if (!match) return null;
  const body = match[2].trim();
  if (!body || /^Questions?\b/i.test(body) || /^What\b/i.test(body)) return null;
  return { label: match[1], text: body };
}

function dedupeOptions(options) {
  const seen = new Set();
  return options.filter(option => {
    if (!option.label) return false;
    const key = option.label.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchingQuestionRows(promptHtml, nodes, items) {
  const itemByQid = new Map(items.map(item => [item.question_id, item]));
  const rows = [];
  const used = new Set();

  nodes.forEach(node => {
    if (node.nodeType !== 1) return;
    node.querySelectorAll('blank[data-qid], [data-saola-blank][data-qid]').forEach(blank => {
      const qid = blank.getAttribute('data-qid');
      const item = itemByQid.get(qid);
      if (!item || used.has(qid)) return;
      used.add(qid);

      const container = blank.closest('p,li,td,div') || blank.parentElement || node;
      const clone = container.cloneNode(true);
      clone.querySelectorAll('blank, [data-saola-blank]').forEach(el => el.replaceWith(el.textContent || ''));
      const text = cleanupMatchingQuestionText(clone.textContent || '', item);
      rows.push({ item, text: text || labelForLooseControl({ prompt_html: promptHtml }, item) });
    });
  });

  items.forEach((item, index) => {
    if (used.has(item.question_id)) return;
    const text = findMatchingQuestionText(promptHtml, nodes, items, index) || labelForLooseControl({ prompt_html: promptHtml }, item);
    used.add(item.question_id);
    rows.push({ item, text });
  });

  return rows.sort((a, b) => Number(a.item.number || 0) - Number(b.item.number || 0));
}

function findMatchingQuestionText(promptHtml, nodes, items, index) {
  const item = items[index];
  const number = Number(item.number || qidNumber(item.question_id));
  if (!number) return '';

  const rawText = questionTextFromPromptHtml(promptHtml, item);
  if (rawText) return rawText;
  const packedText = packedQuestionTextFromPromptHtml(promptHtml, items, index);
  if (packedText) return packedText;

  const laterNumbers = items
    .slice(index + 1)
    .map(next => Number(next.number || qidNumber(next.question_id)))
    .filter(Boolean);

  for (const node of nodes) {
    if (node.nodeType !== 1 || node.matches('h1,ul,ol,.options-box')) continue;
    const text = cleanMatchingText(nodeText(node));
    if (!text || isMatchingInstructionText(text) || isMatchingOptionText(text)) continue;
    const found = questionTextFromNumberedText(text, number, laterNumbers, item);
    if (found) return found;
  }

  const allText = cleanMatchingText(nodes.map(nodeText).join(' '));
  return questionTextFromNumberedText(allText, number, laterNumbers, item);
}

function questionTextFromPromptHtml(promptHtml, item) {
  const number = item.number || qidNumber(item.question_id);
  if (!number) return '';

  const patterns = [
    new RegExp(`<p>\\s*(?:<strong>)?\\s*Question\\s+${escapeRegExp(number)}\\s+([\\s\\S]*?)(?:<\\/strong>)?\\s*<\\/p>`, 'i'),
    new RegExp(`<p>\\s*<strong>\\s*${escapeRegExp(number)}\\s+([\\s\\S]*?)<\\/strong>\\s*<\\/p>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = String(promptHtml || '').match(pattern);
    if (!match) continue;
    const cleaned = cleanupMatchingQuestionText(stripHtml(match[1]), item);
    if (cleaned && !isMatchingInstructionText(cleaned)) return cleaned;
  }

  return '';
}

function packedQuestionTextFromPromptHtml(promptHtml, items, index) {
  const item = items[index];
  const number = Number(item.number || qidNumber(item.question_id));
  if (!number) return '';

  const text = cleanMatchingText(stripHtml(promptHtml));
  const numberText = String(number);
  const laterNumbers = items
    .slice(index + 1)
    .map(next => String(next.number || qidNumber(next.question_id)))
    .filter(Boolean);
  const candidates = [];
  let position = text.indexOf(numberText);

  while (position !== -1) {
    const before = text[position - 1] || '';
    const after = text[position + numberText.length] || '';
    const isStandaloneNumber = !/\d/.test(before) && !/\d/.test(after);
    if (isStandaloneNumber) {
      const endPositions = laterNumbers
        .map(nextNumber => text.indexOf(nextNumber, position + numberText.length))
        .filter(nextPosition => nextPosition > position)
        .sort((a, b) => a - b);
      const end = endPositions[0] || text.length;
      const candidate = cleanupMatchingQuestionText(text.slice(position + numberText.length, end), item);
      if (
        candidate
        && candidate.length <= 90
        && !/^[-–—]/.test(candidate)
        && !isMatchingInstructionText(candidate)
        && !/\b(Questions?|Choose|Write|What visitors can do|Places)$/i.test(candidate)
      ) {
        candidates.push(candidate);
      }
    }
    position = text.indexOf(numberText, position + numberText.length);
  }

  return candidates[candidates.length - 1] || '';
}

function questionTextFromNumberedText(text, number, laterNumbers, item) {
  const normalized = cleanMatchingText(text).replace(/\|/g, ' ');
  const starts = [
    `Question\\s+${number}`,
    `\\(${number}\\)`,
    `${number}`,
  ];
  const end = laterNumbers.length
    ? `(?=\\s+(?:Question\\s+)?(?:\\(${laterNumbers[0]}\\)|${laterNumbers[0]})\\b|$)`
    : '$';

  for (const start of starts) {
    const regex = new RegExp(`(?:^|\\s)${start}\\s+(.+?)${end}`, 'i');
    const match = normalized.match(regex);
    if (match) {
      const cleaned = cleanupMatchingQuestionText(match[1], item);
      if (cleaned && !isMatchingInstructionText(cleaned)) return cleaned;
    }
  }

  return '';
}

function cleanupMatchingQuestionText(text, item) {
  const number = item?.number || qidNumber(item?.question_id);
  return cleanMatchingText(text)
    .replace(/^\|+|\|+$/g, '')
    .replace(new RegExp(`^(?:Question\\s+)?\\(?${escapeRegExp(number)}\\)?\\s*`, 'i'), '')
    .replace(/\s*MATCHING INFORMATION\s+TO CATEGORIES\s+\d+\s*$/i, '')
    .replace(/^[|()\s]+|[|()\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchingIntroHtml(nodes, items, options) {
  const itemNumbers = new Set(items.map(item => Number(item.number || qidNumber(item.question_id))).filter(Boolean));
  const optionLabels = new Set(options.map(option => option.label.toUpperCase()));
  const parts = [];
  let reachedExerciseBody = false;

  nodes.forEach(node => {
    if (reachedExerciseBody) return;
    if (node.nodeType !== 1 || node.matches('h1')) return;
    if (node.matches('ul,ol,.options-box,table')) {
      reachedExerciseBody = true;
      return;
    }
    if (node.querySelector('blank, [data-saola-blank]')) {
      reachedExerciseBody = true;
      return;
    }
    const text = cleanMatchingText(nodeText(node));
    if (!text || text === '.') return;
    if (text.includes('|') || isMatchingOptionText(text, optionLabels) || isMatchingQuestionRowText(text, itemNumbers)) {
      reachedExerciseBody = true;
      return;
    }
    if (isMatchingRowHeadingText(text)) return;

    if (/^Questions?\s+\d/i.test(text)) {
      parts.push(`<p><strong>${escapeHtml(text)}</strong></p>`);
    } else {
      parts.push(`<p>${escapeHtml(text)}</p>`);
    }
  });

  return parts.join('');
}

function matchingRowHeading(nodes, rows) {
  const firstNumber = rows[0]?.item?.number || qidNumber(rows[0]?.item?.question_id);
  const headings = [];
  nodes.forEach(node => {
    if (node.nodeType !== 1 || node.matches('h1,ul,ol,.options-box,table')) return;
    if (node.querySelector('blank, [data-saola-blank]')) return;
    const text = cleanMatchingText(nodeText(node));
    if (isMatchingRowHeadingText(text) && (!firstNumber || !text.includes(String(firstNumber)))) {
      headings.push(text);
    }
  });
  return headings[headings.length - 1] || '';
}

function isMatchingInstructionText(text) {
  return /^Questions\s+\d/i.test(text)
    || /^Choose\b/i.test(text)
    || /^Write\b/i.test(text)
    || /^What\b/i.test(text)
    || /^In which\b/i.test(text)
    || /^Which\b/i.test(text)
    || /^Match\b/i.test(text);
}

function isMatchingOptionText(text, optionLabels = null) {
  const value = cleanMatchingText(text);
  const match = value.match(/^([A-Z])\s*(?:[-.)]\s*)?(.+)$/);
  if (!match) return false;
  return !optionLabels || optionLabels.has(match[1].toUpperCase());
}

function isMatchingQuestionRowText(text, itemNumbers) {
  const value = cleanMatchingText(text);
  if ([...itemNumbers].some(number => new RegExp(`^(?:Question\\s+)?\\(?${number}\\)?\\b`, 'i').test(value))) {
    return true;
  }
  return value.includes('|') && [...itemNumbers].some(number => value.includes(`(${number})`) || new RegExp(`\\b${number}\\b`).test(value));
}

function isMatchingRowHeadingText(text) {
  const value = cleanMatchingText(text);
  if (!value || value.length > 70) return false;
  if (isMatchingInstructionText(value) || isMatchingOptionText(value)) return false;
  return /^(Students|Paintings|Places|Apartments|Internship agencies|People|Characters|Clauses)$/i.test(value)
    || /^[A-Z][A-Za-z' -]+$/.test(value);
}

function renderMatchingOptionBank(options) {
  return `
    <div class="matching-info-option-bank">
      ${options.map(option => `
        <span class="matching-info-option">
          <span class="matching-info-option-label">${escapeHtml(option.label)}</span>
          <span class="matching-info-option-text">${escapeHtml(option.text)}</span>
        </span>
      `).join('')}
    </div>
  `;
}

function cleanMatchingText(value) {
  return String(value || '')
    .replace(/\u00e2\u20ac[\u201d\u201c]/g, '-')
    .replace(/\u00e2\u20ac\u201d/g, '-')
    .replace(/\u00e2\u20ac\u2122/g, "'")
    .replace(/\u00e2\u20ac\u02dc/g, "'")
    .replace(/\u00e2\u20ac\u0153/g, '"')
    .replace(/\u00e2\u20ac\u009d/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderNoteSummaryGroup(group) {
  const boundQids = new Set();
  const items = itemsForGroup(group);
  const itemMap = new Map(items.map(item => [item.question_id, item]));
  const normalizedPrompt = injectMissingNumberedBlanks(normalizeNoteSummaryPromptHtml(group.prompt_html || '', group), items);
  const prompt = renderPromptHtml(normalizedPrompt, boundQids, itemMap, group, items);
  const controls = renderLooseControls(group, boundQids, items);

  return `
    <section class="question-group note-summary-group">
      ${group.instruction ? `<p class="group-instruction">${escapeHtml(group.instruction)}</p>` : ''}
      <div class="prompt-content note-summary-prompt">
        ${prompt}
        ${controls}
      </div>
    </section>
  `;
}

function renderPromptHtml(promptHtml, boundQids, itemMap, group, orderedItems = []) {
  const source = String(promptHtml || '');
  const explicitQids = new Set();
  source.replace(/<blank\b([^>]*)\/?>|<span\b([^>]*\bdata-saola-blank(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*)>\s*<\/span>/gi, (_match, blankAttrs, spanAttrs) => {
    const qid = htmlAttr(blankAttrs || spanAttrs || '', 'data-qid');
    if (qid) explicitQids.add(qid);
    return '';
  });

  let itemCursor = 0;
  let anonymousBlanksToBind = Math.max(orderedItems.length - explicitQids.size, 0);
  const nextUnboundItem = () => {
    while (itemCursor < orderedItems.length && boundQids.has(orderedItems[itemCursor].question_id)) {
      itemCursor += 1;
    }
    const item = orderedItems[itemCursor];
    itemCursor += 1;
    return item;
  };

  return String(promptHtml || '').replace(/<blank\b([^>]*)\/?>|<span\b([^>]*\bdata-saola-blank(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*)>\s*<\/span>/gi, (_match, blankAttrs, spanAttrs) => {
    const attrs = blankAttrs || spanAttrs || '';
    let qid = htmlAttr(attrs, 'data-qid');
    if (!qid) {
      if (anonymousBlanksToBind <= 0) return '';
      anonymousBlanksToBind -= 1;
      qid = nextUnboundItem()?.question_id || '';
    }
    if (!qid) return '';
    boundQids.add(qid);
    const item = itemMap.get(qid) || { question_id: qid, number: qidNumber(qid), response_type: 'text' };
    return renderControl(item, group);
  });
}

function htmlAttr(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(attrs || '').match(pattern);
  return match ? (match[1] || match[2] || match[3] || '') : '';
}

function normalizeNoteSummaryPromptHtml(promptHtml, group) {
  const template = document.createElement('template');
  template.innerHTML = protectBlankTags(promptHtml);

  Array.from(template.content.querySelectorAll('table')).reverse().forEach(table => {
    const replacement = isNoteSummaryOptionTable(table, group)
      ? noteSummaryOptionBankElement(table, group)
      : noteSummaryLayoutElement(table);
    table.replaceWith(replacement);
  });

  return template.innerHTML;
}

function protectBlankTags(promptHtml) {
  return String(promptHtml || '').replace(/<blank\b([^>]*)\/?>/gi, (_match, attrs) => {
    const qid = htmlAttr(attrs, 'data-qid');
    return `<span data-saola-blank="1"${qid ? ` data-qid="${escapeHtml(qid)}"` : ''}></span>`;
  });
}

function injectMissingNumberedBlanks(promptHtml, items) {
  return items.reduce((html, item) => {
    const qid = item.question_id;
    const number = item.number || qidNumber(qid);
    if (!qid || !number || html.includes(`data-qid="${qid}"`) || html.includes(`data-qid='${qid}'`)) {
      return html;
    }

    const marker = new RegExp(`(\\(${escapeRegExp(number)}\\))(?!\\s*<span\\b[^>]*data-saola-blank)`);
    return html.replace(marker, `$1 <span data-saola-blank="1" data-qid="${escapeHtml(qid)}"></span>`);
  }, String(promptHtml || ''));
}

function isNoteSummaryOptionTable(table, group) {
  if (table.querySelector('[data-saola-blank]')) return false;
  const tableOptions = noteSummaryOptionsFromTable(table);
  if (tableOptions.length >= 3) return true;

  const groupOptions = normalizeOptions(group.options || group.choices);
  if (!groupOptions.length) return false;
  const tableText = nodeText(table).toLowerCase();
  const matched = groupOptions.filter(option => (
    tableText.includes(String(option.label || '').toLowerCase())
    && (!option.text || tableText.includes(String(option.text).toLowerCase()))
  ));
  return matched.length >= Math.min(3, groupOptions.length);
}

function noteSummaryOptionBankElement(table, group) {
  const groupOptions = normalizeOptions(group.options || group.choices);
  const parsedOptions = noteSummaryOptionsFromTable(table);
  const options = groupOptions.length ? groupOptions : parsedOptions;
  const bank = document.createElement('div');
  bank.className = 'note-summary-option-bank';
  bank.innerHTML = options.map(option => `
    <span class="note-summary-option">
      <span class="note-summary-option-label">${escapeHtml(option.label)}</span>
      ${option.text ? `<span class="note-summary-option-text">${escapeHtml(option.text)}</span>` : ''}
    </span>
  `).join('');
  return bank;
}

function noteSummaryOptionsFromTable(table) {
  const options = [];
  table.querySelectorAll('th,td').forEach(cell => {
    const text = normalizePlainText(cell.textContent || '');
    const strong = normalizePlainText(cell.querySelector('strong')?.textContent || '');
    const strongMatch = strong.match(/^([A-Z]|[ivxlcdm]{1,6})$/i);
    const textMatch = text.match(/^([A-Z]|[ivxlcdm]{1,6})\b[\s.)-]*(.+)$/i);
    const label = strongMatch?.[1] || textMatch?.[1] || '';
    if (!label) return;
    const body = text.replace(new RegExp(`^${escapeRegExp(label)}\\b[\\s.)-]*`, 'i'), '').trim();
    if (body && !options.some(option => option.label.toLowerCase() === label.toLowerCase())) {
      options.push({ label, text: body });
    }
  });
  return options;
}

function noteSummaryLayoutElement(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  const wrapper = document.createElement('div');
  wrapper.className = 'note-summary-layout';

  if (!rows.length) {
    wrapper.innerHTML = table.innerHTML;
    return wrapper;
  }

  rows.forEach(row => {
    const cells = Array.from(row.children).filter(cell => /^(td|th)$/i.test(cell.tagName));
    if (!cells.length) return;
    const cellHasContent = cell => normalizePlainText(cell.textContent || '') || cell.querySelector('[data-saola-blank]');
    const nonEmptyCells = cells.filter(cellHasContent);
    if (!nonEmptyCells.length) return;

    const detailCells = cells.slice(1).filter(cellHasContent);
    if (cells.length === 1 || !detailCells.length) {
      const line = document.createElement('div');
      line.className = 'note-summary-line';
      line.innerHTML = nonEmptyCells.map(cell => cell.innerHTML).join('<br>');
      wrapper.appendChild(line);
      return;
    }

    const rowEl = document.createElement('div');
    rowEl.className = 'note-summary-row';
    const term = document.createElement('div');
    term.className = 'note-summary-term';
    term.innerHTML = cells[0].innerHTML;
    const detail = document.createElement('div');
    detail.className = 'note-summary-detail';
    detail.innerHTML = detailCells.map(cell => cell.innerHTML).join('<br>');
    rowEl.append(term, detail);
    wrapper.appendChild(rowEl);
  });

  return wrapper;
}

function renderLooseControls(group, boundQids, items) {
  const looseItems = items.filter(item => !boundQids.has(item.question_id));
  if (!looseItems.length) return '';

  return `
    <div class="loose-controls">
      ${looseItems.map(item => `
        <label class="loose-control">
          <span class="question-label">${labelHtmlForLooseControl(group, item)}</span>
          ${renderControl(item, group)}
        </label>
      `).join('')}
    </div>
  `;
}

function labelHtmlForLooseControl(group, item) {
  if (shouldUseMapLooseLabel(group, item)) {
    const number = item.number || qidNumber(item.question_id) || '';
    const itemText = stripHtml(item.prompt_html || '').replace(/^Question\s+\d+\s*/i, '').trim();
    const numberHtml = number ? `<strong>${escapeHtml(number)}</strong>` : '';
    return [numberHtml, itemText ? escapeHtml(itemText) : ''].filter(Boolean).join(' ');
  }

  return escapeHtml(labelForLooseControl(group, item));
}

function shouldUseMapLooseLabel(group, item) {
  if (!isMapLabellingGroup(group)) return false;
  const prompt = stripHtml(group.prompt_html || '').toLowerCase();
  const itemText = stripHtml(item.prompt_html || '').toLowerCase();
  return Boolean(itemText && !prompt.includes(itemText));
}

function labelForLooseControl(group, item) {
  const prompt = String(group.prompt_html || '');
  const itemText = String(item.prompt_html || '').trim();
  if (itemText && prompt.includes(itemText)) {
    return `Question ${item.number || qidNumber(item.question_id) || ''}`.trim();
  }
  return itemText || `Question ${item.number || qidNumber(item.question_id) || ''}`.trim();
}

function normalizeOptions(options) {
  return Array.isArray(options)
    ? options
        .map(option => (typeof option === 'string' ? { label: option, text: '' } : option))
        .filter(option => option && option.label)
    : [];
}

function extractPromptOptionLabels(promptHtml) {
  const labels = [];
  const seen = new Set();
  const regex = /<strong>\s*([A-Z]|[ivxlcdm]{1,6})\s*<\/strong>/gi;
  let match = regex.exec(promptHtml || '');
  while (match) {
    const label = match[1];
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      labels.push(label);
    }
    match = regex.exec(promptHtml || '');
  }
  return labels;
}

function implicitOptionsForGroup(group) {
  const qType = String(group.question_type || group.type || '').toLowerCase();
  if (qType.includes('tfng') || qType.includes('true_false_not_given')) {
    return ['TRUE', 'FALSE', 'NOT GIVEN'].map(label => ({ label, text: '' }));
  }
  if (qType.includes('ynng') || qType.includes('yes_no_not_given')) {
    return ['YES', 'NO', 'NOT GIVEN'].map(label => ({ label, text: '' }));
  }
  if (/(matching|heading|sentence_endings)/i.test(qType)) {
    return extractPromptOptionLabels(group.prompt_html).map(label => ({ label, text: '' }));
  }
  return [];
}

function renderMcqGroup(group) {
  const items = itemsForGroup(group);
  const model = buildMcqModel(group, items);
  const body = model.mode === 'single'
    ? model.blocks.map(block => renderMcqSingleQuestion(group, block)).join('')
    : model.blocks.map(block => renderMcqMultiBlock(group, block)).join('');

  return `
    <section class="question-group mcq-rendered-group">
      ${group.instruction ? `<p class="group-instruction">${escapeHtml(group.instruction)}</p>` : ''}
      <div class="prompt-content mcq-prompt-content">
        ${model.introHtml ? `<div class="mcq-intro">${model.introHtml}</div>` : ''}
        <div class="mcq-rendered-list">${body}</div>
      </div>
    </section>
  `;
}

function buildMcqModel(group, items) {
  const promptHtml = String(group.prompt_html || '');
  const nodes = promptNodes(promptHtml);
  const optionTables = nodes.filter(node => node.nodeType === 1 && node.matches('table') && optionsFromTable(node).length >= 2);
  const qType = String(group.question_type || group.type || '').toLowerCase();
  
  let selectCount;
  if (qType.includes('single')) {
    selectCount = 1;
  } else if (qType.includes('multi')) {
    selectCount = extractSelectionCount(stripHtml(promptHtml)) || 2;
  } else {
    selectCount = extractSelectionCount(stripHtml(promptHtml)) || 1;
  }

  const isSinglePerQuestion = qType.includes('single') && optionTables.length === items.length && selectCount <= 1;

  if (isSinglePerQuestion) {
    return {
      mode: 'single',
      introHtml: extractMcqSingleIntroHtml(nodes, optionTables[0], items[0]),
      blocks: items.map((item, index) => ({
        item,
        qids: [item.question_id],
        questionText: extractMcqSingleQuestionText(item, nodes, optionTables[index]),
        options: optionsFromTable(optionTables[index]),
      })).filter(block => block.options.length),
    };
  }

  return {
    mode: 'multi',
    introHtml: extractMcqMultiIntroHtml(nodes),
    blocks: buildMcqMultiBlocks(group, items, nodes, optionTables, selectCount),
  };
}

function promptNodes(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return Array.from(template.content.childNodes)
    .filter(node => node.nodeType === 1 || normalizePlainText(node.textContent));
}

function stripHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return normalizePlainText(template.content.textContent || '');
}

function normalizePlainText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function nodeText(node) {
  return normalizePlainText(node?.textContent || '');
}

function outerHtml(node) {
  if (!node) return '';
  return node.nodeType === 1 ? node.outerHTML : escapeHtml(node.textContent || '');
}

function extractSelectionCount(text) {
  const upper = String(text || '').toUpperCase();
  const match = upper.match(/(?:CHOOSE|WHICH|WRITE)\s+(?:THE\s+)?(?:CORRECT\s+)?(?:LETTERS?\s+)?(TWO|THREE|FOUR|FIVE|SIX|\d+)\b/);
  if (match) {
    const wordMap = { TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6 };
    return wordMap[match[1]] || Number(match[1]);
  }
  return 0;
}

function extractMcqSingleQuestionText(item, nodes, table) {
  const defaultText = item.prompt_html || `Question ${item.number || qidNumber(item.question_id) || ''}`;
  if (!/^Question\s*\d*$/i.test(defaultText.trim())) {
    return defaultText;
  }
  const tableIndex = nodes.indexOf(table);
  if (tableIndex > 0) {
    let candidateText = '';
    for (let i = tableIndex - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.nodeType === 1 && node.matches('table')) break;
      const text = nodeText(node);
      if (/^Questions?\s+\d+/i.test(text) || isMcqInstructionLine(text)) continue;
      candidateText = text;
      break;
    }
    if (candidateText) {
      const number = item.number || qidNumber(item.question_id);
      if (number) {
        return candidateText.replace(new RegExp(`^\\s*${number}\\s*[-.)]?\\s*`), '').trim() || defaultText;
      }
      return candidateText;
    }
  }
  return defaultText;
}

function extractMcqSingleIntroHtml(nodes, firstOptionTable, firstItem) {
  const firstItemText = normalizePlainText(firstItem?.prompt_html || '');
  const parts = [];
  for (const node of nodes) {
    if (node === firstOptionTable) break;
    const text = nodeText(node);
    if (firstItemText && text.includes(firstItemText)) break;
    if (node.nodeType === 1 && node.matches('table')) continue;
    parts.push(outerHtml(node));
  }
  return parts.join('');
}

function extractMcqMultiIntroHtml(nodes) {
  const parts = [];
  for (const node of nodes) {
    if (node.nodeType === 1 && node.matches('table')) break;
    const text = nodeText(node);
    if (isMcqOptionLine(text)) break;
    if (/^\(?\d{1,2}\)?$/.test(text)) break;
    if (/^\d+\s*[-–]\s*\d+.*\?/.test(text)) break;
    if (/^Which\b/i.test(text)) break;
    if (/^According to\b/i.test(text)) break;
    if (/^What\b/i.test(text) && /\?/.test(text)) break;
    if (isMcqInstructionLine(text)) {
      parts.push(outerHtml(node));
    }
  }
  return parts.join('');
}

function isMcqInstructionLine(text) {
  const value = String(text || '').trim();
  return /^MULTIPLE CHOICE\b/i.test(value)
    || /^Questions?\s+\d/i.test(value)
    || /^Choose\b/i.test(value)
    || /^For each question\b/i.test(value)
    || /^Write\b/i.test(value);
}

function optionsFromTable(table) {
  if (!table) return [];
  const options = [];
  table.querySelectorAll('tr').forEach(row => {
    const cells = Array.from(row.querySelectorAll('th,td'));
    if (!cells.length) return;
    const strongText = normalizePlainText(row.querySelector('strong')?.textContent || '');
    const combined = normalizePlainText(cells.map(cell => cell.textContent || '').join(' '));
    let label = '';
    let text = '';

    const strongMatch = strongText.match(/^([A-Z])\b/);
    const combinedMatch = combined.match(/^([A-Z])\b[\s.)-]*(.*)$/);
    if (strongMatch) {
      label = strongMatch[1];
    } else if (combinedMatch) {
      label = combinedMatch[1];
    }

    if (!label) return;

    if (cells.length > 1 && normalizePlainText(cells[0].textContent) === label) {
      text = normalizePlainText(cells.slice(1).map(cell => cell.textContent || '').join(' '));
    } else {
      text = combined.replace(new RegExp(`^${label}\\b[\\s.)-]*`), '').trim();
    }

    if (!options.some(option => option.label === label)) {
      options.push({ label, text });
    }
  });
  return options;
}

function optionsFromOptionParagraphs(nodes) {
  const options = [];
  nodes.forEach(node => {
    const text = nodeText(node);
    const match = text.match(/^([A-Z])\s*[-.)]\s*(.+)$/);
    if (match && !options.some(option => option.label === match[1])) {
      options.push({ label: match[1], text: match[2].trim() });
    }
  });
  return options;
}

function isMcqOptionLine(text) {
  return /^([A-Z])\s*[-.)]\s+/.test(String(text || '').trim());
}

function buildMcqMultiBlocks(group, items, nodes, optionTables, defaultSelectCount) {
  if (!optionTables.length) {
    return buildMcqParagraphOptionBlocks(group, items, nodes, defaultSelectCount);
  }

  const itemByNumber = new Map(items.map(item => [Number(item.number || qidNumber(item.question_id)), item]));
  const blocks = [];
  let itemCursor = 0;
  let previousTableIndex = -1;

  optionTables.forEach((table, index) => {
    const tableIndex = nodes.indexOf(table);
    const segment = nodes.slice(previousTableIndex + 1, tableIndex);
    previousTableIndex = tableIndex;
    let qids = questionIdsFromNodes(segment, itemByNumber);
    const blockText = normalizePlainText(segment.map(nodeText).join(' '));
    const selectCount = extractSelectionCount(blockText) || defaultSelectCount || Math.max(1, qids.length);

    if (!qids.length) {
      qids = items.slice(itemCursor, itemCursor + selectCount).map(item => item.question_id);
    }
    itemCursor = Math.max(itemCursor, items.findIndex(item => item.question_id === qids[qids.length - 1]) + 1);

    blocks.push({
      blockId: `${group.group_id || 'mcq'}-${index}`,
      qids,
      questionText: questionStemFromNodes(segment),
      options: optionsFromTable(table),
      maxSelect: Math.max(qids.length, selectCount),
    });
  });

  return blocks.filter(block => block.qids.length && block.options.length);
}

function buildMcqParagraphOptionBlocks(group, items, nodes, defaultSelectCount) {
  const blocks = [];
  const itemByNumber = new Map(items.map(item => [Number(item.number || qidNumber(item.question_id)), item]));
  let current = null;

  nodes.forEach(node => {
    const text = nodeText(node);
    const range = text.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\b(.*)$/);
    if (range && (/\?/.test(text) || /which|choose|what/i.test(text))) {
      if (current) blocks.push(current);
      const start = Number(range[1]);
      const end = Number(range[2]);
      const qids = [];
      for (let n = start; n <= end; n += 1) {
        const item = itemByNumber.get(n);
        if (item) qids.push(item.question_id);
      }
      current = {
        blockId: `${group.group_id || 'mcq'}-${blocks.length}`,
        qids,
        questionText: text.replace(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s*/, '').trim(),
        options: [],
        maxSelect: qids.length || defaultSelectCount,
      };
      return;
    }

    if (current && isMcqOptionLine(text)) {
      const [option] = optionsFromOptionParagraphs([node]);
      if (option) current.options.push(option);
    }
  });

  if (current) blocks.push(current);

  if (!blocks.length) {
    const options = optionsFromOptionParagraphs(nodes);
    if (options.length) {
      blocks.push({
        blockId: `${group.group_id || 'mcq'}-0`,
        qids: items.map(item => item.question_id),
        questionText: questionStemFromNodes(nodes),
        options,
        maxSelect: items.length || defaultSelectCount,
      });
    }
  }

  return blocks.filter(block => block.qids.length && block.options.length);
}

function questionIdsFromNodes(nodes, itemByNumber) {
  const ids = [];
  nodes.forEach(node => {
    const text = nodeText(node);
    if (/^Questions?\s+\d{1,2}\s*[-–]\s*\d{1,2}\b/i.test(text)) return;
    if (isMcqInstructionLine(text)) return;
    const matches = text.match(/\(?\b\d{1,2}\b\)?/g) || [];
    matches.forEach(match => {
      const number = Number(match.replace(/[^\d]/g, ''));
      const item = itemByNumber.get(number);
      if (item && !ids.includes(item.question_id)) ids.push(item.question_id);
    });
  });
  return ids;
}

function questionStemFromNodes(nodes) {
  const candidates = nodes
    .filter(node => node.nodeType !== 1 || !node.matches('table'))
    .map(nodeText)
    .filter(text => text && !/^Questions?\s+\d/i.test(text))
    .filter(text => !/^Choose\b/i.test(text))
    .filter(text => !/^Write\b/i.test(text))
    .filter(text => !/^\(?\d{1,2}\)?$/.test(text))
    .filter(text => !/^\(?\d{1,2}\)?\s*(?:[-–]\s*\(?\d{1,2}\)?\s*)*$/.test(text))
    .filter(text => !isMcqOptionLine(text))
    .filter(text => !/and\s+write\s+them\s+in\s+any\s+order/i.test(text));
  return candidates[candidates.length - 1] || 'Choose the correct answer.';
}

function renderMcqSingleQuestion(group, block) {
  const qid = block.item.question_id;
  const number = block.item.number || qidNumber(qid) || '';
  return `
    <div class="mcq-question-card" data-mcq-card="${escapeHtml(qid)}">
      <div class="mcq-question-title"><span class="inline-question-badge">${escapeHtml(number)}</span>${escapeHtml(block.questionText)}</div>
      <input type="hidden" id="input-${escapeHtml(qid)}" data-qid="${escapeHtml(qid)}" class="ex-input mcq-answer-store" value="">
      <div class="mcq-options-list">
        ${block.options.map(option => `
          <label class="mcq-choice">
            <input type="radio" name="mcq-${escapeHtml(qid)}" value="${escapeHtml(option.label)}" data-mcq-qid="${escapeHtml(qid)}">
            <span class="mcq-choice-label">${escapeHtml(option.label)}</span>
            <span class="mcq-choice-text">${escapeHtml(option.text)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMcqMultiBlock(group, block) {
  return `
    <div class="mcq-question-card mcq-multi-block" data-block-id="${escapeHtml(block.blockId)}" data-qids="${escapeHtml(block.qids.join(' '))}" data-max-select="${escapeHtml(block.maxSelect)}">
      <div class="mcq-question-title">${escapeHtml(block.questionText)}</div>
      <div class="mcq-slot-row">
        ${block.qids.map(qid => `
          <span class="mcq-slot" data-qid="${escapeHtml(qid)}">
            <span class="inline-question-badge">${escapeHtml(qidNumber(qid))}</span>
            <span class="mcq-slot-value">--</span>
            <input type="hidden" id="input-${escapeHtml(qid)}" data-qid="${escapeHtml(qid)}" class="ex-input mcq-answer-store" value="">
          </span>
        `).join('')}
      </div>
      <div class="selection-helper">Select ${escapeHtml(block.maxSelect)} answer${Number(block.maxSelect) === 1 ? '' : 's'}.</div>
      <div class="mcq-options-list">
        ${block.options.map(option => `
          <label class="mcq-choice">
            <input type="checkbox" value="${escapeHtml(option.label)}" data-mcq-block="${escapeHtml(block.blockId)}">
            <span class="mcq-choice-label">${escapeHtml(option.label)}</span>
            <span class="mcq-choice-text">${escapeHtml(option.text)}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function setupMcqControls() {
  document.querySelectorAll('[data-mcq-qid]').forEach(input => {
    if (input.dataset.mcqReady) return;
    input.dataset.mcqReady = 'true';
    input.addEventListener('change', () => {
      setStoredAnswer(input.dataset.mcqQid, input.value);
    });
  });

  document.querySelectorAll('.mcq-multi-block').forEach(block => {
    if (block.dataset.mcqReady) return;
    block.dataset.mcqReady = 'true';
    const qids = String(block.dataset.qids || '').split(/\s+/).filter(Boolean);
    const maxSelect = Number(block.dataset.maxSelect || qids.length || 1);
    block.querySelectorAll('[data-mcq-block]').forEach(input => {
      input.addEventListener('change', () => {
        const checked = Array.from(block.querySelectorAll('[data-mcq-block]:checked'));
        if (checked.length > maxSelect) {
          input.checked = false;
          return;
        }

        qids.forEach((qid, index) => {
          const value = checked[index]?.value || '';
          setStoredAnswer(qid, value);
          const slot = block.querySelector(`.mcq-slot[data-qid="${qid}"] .mcq-slot-value`);
          if (slot) slot.textContent = value || '--';
        });
      });
    });
  });
}

function setStoredAnswer(qid, value) {
  const store = document.getElementById(`input-${qid}`);
  if (!store) return;
  store.value = value || '';
  store.dispatchEvent(new Event('input', { bubbles: true }));
  store.dispatchEvent(new Event('change', { bubbles: true }));
  updateNavDots();
}

function renderControl(item, group) {
  const qid = item.question_id;
  const number = item.number || qidNumber(qid) || '';
  const responseType = item.response_type || 'text';
  const options = normalizeOptions(item.options || group.options || group.choices);
  const implicitOptions = options.length ? [] : implicitOptionsForGroup(group);
  const selectOptions = options.length ? options : implicitOptions;

  if (responseType === 'select' || selectOptions.length) {
    return `
      <select id="input-${qid}" data-qid="${qid}" class="ex-input ex-select" aria-label="Question ${number}">
        <option value="">${number ? `Question ${number}` : '-- Select --'}</option>
        ${selectOptions.map(option => `
          <option value="${escapeHtml(option.label)}">${escapeHtml(option.label)}${option.text ? `. ${escapeHtml(option.text)}` : ''}</option>
        `).join('')}
      </select>
    `;
  }

  return `
    <input
      type="text"
      id="input-${qid}"
      data-qid="${qid}"
      placeholder="${number || ''}"
      class="ex-input"
      aria-label="Question ${number}"
    >
  `;
}

function normalizeAnswer(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function validateMinimumAnswered() {
  const controls = Array.from(document.querySelectorAll('.ex-input'));
  const total = controls.length;
  if (!total) return true;

  const answered = controls.filter(control => String(control.value || '').trim()).length;
  const required = Math.ceil(total * MIN_SUBMIT_RATIO);
  if (answered >= required) return true;

  showInlineMessage(`Please answer at least ${required}/${total} questions before submitting.`);
  return false;
}

function showInlineMessage(message) {
  let messageBox = document.getElementById('exercise-message');
  const submitButton = document.getElementById('btn-submit');

  if (!messageBox) {
    messageBox = document.createElement('div');
    messageBox.id = 'exercise-message';
    messageBox.className = 'exercise-message';
    submitButton?.insertAdjacentElement('beforebegin', messageBox);
  }

  messageBox.textContent = message;
  messageBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitAnswers() {
  if (hasSubmitted || !currentExercise) return;
  if (!validateMinimumAnswered()) return;

  hasSubmitted = true;
  if (timerInterval) clearInterval(timerInterval);

  const submitButton = document.getElementById('btn-submit');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Checking...';
  }

  try {
    await loadAfterSubmitFiles();
  } catch (err) {
    console.error(err);
    showSubmitError('Could not load answer key. Please try again.');
    hasSubmitted = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Answers';
    }
    return;
  }

  if (submitButton) submitButton.style.display = 'none';
  document.querySelectorAll('.mcq-choice input').forEach(input => {
    input.disabled = true;
  });

  const canShowExplanations = Boolean(currentExplanationsRoot);
  let correctCount = 0;
  let gradedCount = 0;

  document.querySelectorAll('.ex-input').forEach(input => {
    const qid = input.dataset.qid;
    const answers = getAnswers(qid);
    if (!answers.length) return;

    gradedCount += 1;
    input.disabled = true;

    const userAnswer = normalizeAnswer(input.value);
    const normalizedAnswers = answers.map(normalizeAnswer);
    const isCorrect = normalizedAnswers.includes(userAnswer);

    if (isCorrect) correctCount += 1;
    markInput(input, isCorrect);
    insertAnswerFeedback(input, qid, answers, canShowExplanations);
  });

  showResult(correctCount, gradedCount, canShowExplanations);
  renderTranscript(Boolean(currentExplanationsRoot || currentTranscriptRoot));
  renderFollowUps();
}

function renderTranscript(canShowTranscript) {
  if (!canShowTranscript) return;
  const transcriptHtml = currentExplanationsRoot?.transcript_html || getTranscriptHtml(currentTranscriptRoot);
  if (!transcriptHtml) return;

  const result = document.getElementById('result-section');
  if (!result) return;
  const questionContent = document.getElementById('question-content');
  const placeAfterQuestions = document.body.classList.contains('listening-exercise-page') && questionContent;
  
  let transcriptBox = document.getElementById('transcript-box');
  if (!transcriptBox) {
    transcriptBox = document.createElement('div');
    transcriptBox.id = 'transcript-box';
    transcriptBox.className = 'transcript-box';
    transcriptBox.style.marginTop = '24px';
    transcriptBox.style.padding = '24px';
    transcriptBox.style.background = '#f8fafc';
    transcriptBox.style.border = '1px solid #cbd5e1';
    transcriptBox.style.borderRadius = '8px';
    
    if (placeAfterQuestions) {
      questionContent.insertAdjacentElement('afterend', transcriptBox);
    } else {
      const followUp = result.querySelector('.follow-up-box');
      if (followUp) {
        followUp.parentNode.insertBefore(transcriptBox, followUp);
      } else {
        result.appendChild(transcriptBox);
      }
    }
  }
  
  transcriptBox.innerHTML = `
    <h3 style="margin-top:0; margin-bottom:16px; color:#0f172a; font-family:var(--display-font, sans-serif); font-size: 1.15rem;">Transcript</h3>
    <div style="color:#334155; line-height:1.65; font-size: 0.98rem;">${transcriptHtml}</div>
  `;
}

function getTranscriptHtml(transcriptRoot) {
  if (!transcriptRoot) return '';
  if (transcriptRoot.transcript_html) return transcriptRoot.transcript_html;
  const parts = Array.isArray(transcriptRoot.parts) ? transcriptRoot.parts : [];
  return parts
    .map(part => part.annotated_transcript_html || '')
    .filter(Boolean)
    .join('');
}

async function loadAfterSubmitFiles() {
  if (!currentAnswerKeyRoot) {
    if (currentExercise.answer_key) {
      currentAnswerKeyRoot = { answer_key: currentExercise.answer_key };
    } else {
      currentAnswerKeyRoot = await fetchJson(resolveDataUrl(currentExercise.file_refs?.answer_key));
    }
  }

  if (isAuthenticatedStudent() && !currentExplanationsRoot) {
    if (currentExercise.explanations) {
      currentExplanationsRoot = { explanations: currentExercise.explanations };
    } else if (currentExercise.file_refs?.explanations) {
      currentExplanationsRoot = await fetchJson(resolveDataUrl(currentExercise.file_refs.explanations));
    }
  }

  if (!currentTranscriptRoot) {
    if (currentExercise.transcript_html) {
      currentTranscriptRoot = { transcript_html: currentExercise.transcript_html };
    } else if (currentExercise.file_refs?.transcript) {
      try {
        currentTranscriptRoot = await fetchJson(resolveDataUrl(currentExercise.file_refs.transcript));
      } catch (err) {
        console.warn('Could not load transcript file:', err);
      }
    }
  }
}

function isAuthenticatedStudent() {
  if (window.SaolaAuth?.isLoggedIn?.()) return true;
  if (window.SAOLA_USER?.authenticated || window.SAOLA_USER?.mode === 'authenticated_student') return true;
  if (params.get('mode') === 'authenticated_student') return true;
  if (params.get('auth') === '1' || params.get('loggedIn') === '1') return true;

  try {
    return Boolean(
      localStorage.getItem('saola_static_login') ||
      localStorage.getItem('saola_auth_state') ||
      localStorage.getItem('saola_auth_token') ||
      localStorage.getItem('saolaAuthToken') ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('saola_static_login') ||
      sessionStorage.getItem('saola_auth_state') ||
      sessionStorage.getItem('saola_auth_token') ||
      sessionStorage.getItem('saolaAuthToken') ||
      sessionStorage.getItem('auth_token')
    );
  } catch (_err) {
    return false;
  }
}

function showSubmitError(message) {
  const result = document.getElementById('result-section');
  if (!result) return;
  result.style.display = 'block';
  const title = result.querySelector('.score-title');
  if (title) title.textContent = message;
}

function markInput(input, isCorrect) {
  input.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  if (input.classList.contains('mcq-answer-store')) {
    const slot = input.closest('.mcq-slot');
    const card = input.closest('.mcq-question-card');
    if (slot) slot.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    if (!slot && card) card.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
  }
}

function insertAnswerFeedback(input, qid, answers, canShowExplanations) {
  const details = canShowExplanations ? getExplanation(qid) : {};
  const box = document.createElement('div');
  box.className = 'answer-feedback';
  box.innerHTML = `
    <strong>Answer:</strong> ${escapeHtml(answers.join(' / '))}
    ${details.explanation ? `<br><strong>Explanation:</strong> ${escapeHtml(details.explanation)}` : ''}
    ${details.evidence ? `<br><em><strong>Evidence:</strong> "${escapeHtml(details.evidence)}"</em>` : ''}
  `;
  if (input.classList.contains('mcq-answer-store')) {
    const card = input.closest('.mcq-question-card');
    if (card) {
      card.appendChild(box);
      return;
    }
  }
  const rowContainer = input.closest('.loose-control, .matching-info-question-row, .note-summary-row');
  if (rowContainer) {
    rowContainer.insertAdjacentElement('afterend', box);
    return;
  }
  const shortAnswerRow = input.closest('.short-answer-row');
  if (shortAnswerRow) {
    shortAnswerRow.appendChild(box);
    return;
  }
  input.insertAdjacentElement('afterend', box);
}

function showResult(correctCount, gradedCount, canShowExplanations) {
  const result = document.getElementById('result-section');
  if (!result) return;

  if (document.body.classList.contains('reading-exercise-page')) {
    const rightPanel = document.getElementById('rightPanel');
    if (rightPanel && result.parentElement !== rightPanel) {
      rightPanel.insertBefore(result, rightPanel.firstChild);
    }
  } else if (document.body.classList.contains('listening-exercise-page')) {
    const questionContent = document.getElementById('question-content');
    const container = document.querySelector('.runner-container');
    if (questionContent && container && result.parentElement !== container) {
      container.insertBefore(result, questionContent);
    } else if (questionContent && result.nextElementSibling !== questionContent) {
      questionContent.parentNode.insertBefore(result, questionContent);
    }
  }

  result.style.display = 'block';
  const title = result.querySelector('.score-title');
  if (title) title.textContent = `Result: ${correctCount} / ${gradedCount}`;

  const scoreCard = result.querySelector('.score-card');
  if (scoreCard && !canShowExplanations && !scoreCard.querySelector('.login-note')) {
    const note = document.createElement('p');
    note.className = 'login-note';
    note.textContent = 'Detailed explanations are available after student login.';
    scoreCard.appendChild(note);
  }

  if (document.body.classList.contains('reading-exercise-page')) {
    document.getElementById('rightPanel')?.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    result.scrollIntoView({ behavior: 'smooth' });
  }
}

function renderFollowUps() {
  const container = document.getElementById('follow-up-container');
  if (!container) return;

  const links = currentExercise.follow_up_links || [];
  if (!links.length) {
    container.innerHTML = '<p>No follow-up tasks available.</p>';
    return;
  }

  container.innerHTML = links.map(link => `
    <a href="#" class="btn-followup" data-task-id="${escapeHtml(link.task_id || '')}">
      ${escapeHtml(link.label || link.task_type || 'Practice')}
    </a>
  `).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
