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
let timerInterval = null;
let hasSubmitted = false;

async function loadExercise(id) {
  try {
    currentExercise = await fetchJson(resolveDataUrl(`${id}.json`));
    document.getElementById('ex-title').textContent = currentExercise.title || id;
    document.title = `${currentExercise.title || id} - Saola`;

    setupAudio(currentExercise);
    setupTimer(currentExercise);
    renderExercise(currentExercise);
  } catch (err) {
    console.error(err);
    document.getElementById('question-content').innerHTML = '<p>Error loading exercise data.</p>';
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

  if (!duration) {
    timer.textContent = 'Practice';
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

  if (isReading && passageHtml) {
    content.classList.add('reading-shell');
    content.innerHTML = `
      <section class="reading-layout">
        <article class="reading-passage">
          ${data.content?.title ? `<h1>${escapeHtml(data.content.title)}</h1>` : ''}
          ${passageHtml}
        </article>
        <aside class="reading-questions">
          ${groupsHtml}
        </aside>
      </section>
    `;
    return;
  }

  content.classList.remove('reading-shell');
  content.innerHTML = groupsHtml;
}

function renderGroup(group) {
  const boundQids = new Set();
  const items = itemsForGroup(group);
  const itemMap = new Map(items.map(item => [item.question_id, item]));
  const prompt = renderPromptHtml(group.prompt_html || '', boundQids, itemMap, group);
  const controls = renderLooseControls(group, boundQids, items);

  return `
    <section class="question-group">
      ${group.instruction ? `<p class="group-instruction">${escapeHtml(group.instruction)}</p>` : ''}
      <div class="prompt-content">
        ${prompt}
        ${controls}
      </div>
    </section>
  `;
}

function renderPromptHtml(promptHtml, boundQids, itemMap, group) {
  return promptHtml.replace(/<blank\b[^>]*data-qid=["']([^"']+)["'][^>]*\/?>/gi, (_match, qid) => {
    boundQids.add(qid);
    const item = itemMap.get(qid) || { question_id: qid, number: qidNumber(qid), response_type: 'text' };
    return renderControl(item, group);
  });
}

function renderLooseControls(group, boundQids, items) {
  const looseItems = items.filter(item => !boundQids.has(item.question_id));
  if (!looseItems.length) return '';

  return `
    <div class="loose-controls">
      ${looseItems.map(item => `
        <label class="loose-control">
          <span class="question-label">${escapeHtml(item.prompt_html || `Question ${item.number}`)}</span>
          ${renderControl(item, group)}
        </label>
      `).join('')}
    </div>
  `;
}

function renderControl(item, group) {
  const qid = item.question_id;
  const number = item.number || qidNumber(qid) || '';
  const responseType = item.response_type || 'text';

  if (responseType === 'select') {
    const options = item.options || group.options || [];
    return `
      <select id="input-${qid}" data-qid="${qid}" class="ex-input ex-select" aria-label="Question ${number}">
        <option value="">${number ? `${number}` : 'Select'}</option>
        ${options.map(option => `
          <option value="${escapeHtml(option.label)}">${escapeHtml(option.label)}. ${escapeHtml(option.text || '')}</option>
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
  renderFollowUps();
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
  input.insertAdjacentElement('afterend', box);
}

function showResult(correctCount, gradedCount, canShowExplanations) {
  const result = document.getElementById('result-section');
  if (!result) return;

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

  result.scrollIntoView({ behavior: 'smooth' });
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
