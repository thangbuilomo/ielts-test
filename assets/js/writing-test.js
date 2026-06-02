(function () {
  'use strict';

  const GAS_URL = document.body.dataset.gasUrl;
  const TEST_ID = document.body.dataset.testId || 'writing_mock_test_01';
  const DURATION_SECONDS = 3600;
  const MAX_VIOLATIONS = 5;
  const MIN_WORDS = { 1: 150, 2: 250 };
  const WARNING_MARKERS = [
    { elapsed: 1200, message: '20 minutes passed. Move to Task 2 soon if you have not.' },
    { elapsed: 2400, message: '40 minutes passed. You have 20 minutes left.' },
    { elapsed: 3300, message: '5 minutes left. Finish and check your answer.' }
  ];

  const els = {
    writingShell: document.getElementById('writingShell'),
    splitHandle: document.getElementById('splitHandle'),
    startOverlay: document.getElementById('startOverlay'),
    studentEmail: document.getElementById('studentEmail'),
    studentPassword: document.getElementById('studentPassword'),
    startError: document.getElementById('startError'),
    startBtn: document.getElementById('startBtn'),
    guestBtn: document.getElementById('guestBtn'),
    attemptLabel: document.getElementById('attemptLabel'),
    timerDisplay: document.getElementById('timerDisplay'),
    saveStatus: document.getElementById('saveStatus'),
    violationBadge: document.getElementById('violationBadge'),
    submitTopBtn: document.getElementById('submitTopBtn'),
    task1Text: document.getElementById('task1Text'),
    task2Text: document.getElementById('task2Text'),
    wc1: document.getElementById('wc1'),
    wc2: document.getElementById('wc2'),
    wcTab1: document.getElementById('wcTab1'),
    wcTab2: document.getElementById('wcTab2'),
    min1: document.getElementById('min1'),
    min2: document.getElementById('min2'),
    warningToast: document.getElementById('warningToast'),
    finishSoundHost: document.getElementById('finishSoundHost'),
    violationModal: document.getElementById('violationModal'),
    violationMessage: document.getElementById('violationMessage'),
    violationCountText: document.getElementById('violationCountText'),
    ackViolationBtn: document.getElementById('ackViolationBtn'),
    submitModal: document.getElementById('submitModal'),
    submitSummary: document.getElementById('submitSummary'),
    cancelSubmitBtn: document.getElementById('cancelSubmitBtn'),
    confirmSubmitBtn: document.getElementById('confirmSubmitBtn'),
    receiptModal: document.getElementById('receiptModal'),
    receiptContent: document.getElementById('receiptContent')
  };

  const state = {
    started: false,
    submitted: false,
    authenticated: false,
    guestMode: false,
    authToken: '',
    studentName: '',
    email: '',
    attemptId: '',
    startedAt: '',
    timerRemaining: DURATION_SECONDS,
    timerHandle: null,
    saveHandle: null,
    violationCount: 0,
    violationSummary: {},
    events: [],
    warnedMarkers: new Set(),
    lastEventAt: {}
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function elapsedSeconds() {
    if (!state.startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - Date.parse(state.startedAt)) / 1000));
  }

  function createAttemptId() {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 8);
    return `wmock_${stamp}_${rand}`;
  }

  function submitReasonLabel(reason) {
    if (reason === 'violation_threshold') return 'Tự động nộp bài do vi phạm nội quy 5 lần';
    if (reason === 'time_expired') return 'Tự động nộp bài do hết giờ';
    return 'Học viên tự nộp bài';
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function isMobileLike() {
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.innerWidth < 900;
  }

  function fmtTime(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function countWords(text) {
    const matches = text.trim().match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g);
    return matches ? matches.length : 0;
  }

  function updateWordCounts() {
    const wc1 = countWords(els.task1Text.value);
    const wc2 = countWords(els.task2Text.value);
    els.wc1.textContent = `${wc1} words`;
    els.wc2.textContent = `${wc2} words`;
    els.wcTab1.textContent = `${wc1} words`;
    els.wcTab2.textContent = `${wc2} words`;
    els.min1.classList.toggle('ok', wc1 >= MIN_WORDS[1]);
    els.min2.classList.toggle('ok', wc2 >= MIN_WORDS[2]);
  }

  function draftKey() {
    return `saola_writing_draft_${TEST_ID}_${state.email || 'unknown'}`;
  }

  function saveDraft() {
    if (!state.started || state.submitted) return;
    const data = {
      test_id: TEST_ID,
      student_name: state.studentName,
      email: state.email,
      attempt_id: state.attemptId,
      task1_text: els.task1Text.value,
      task2_text: els.task2Text.value,
      updated_at: nowIso()
    };
    localStorage.setItem(draftKey(), JSON.stringify(data));
    els.saveStatus.textContent = state.guestMode ? 'Guest local save' : 'Saved';
  }

  function scheduleSave() {
    updateWordCounts();
    if (!state.started || state.submitted) return;
    els.saveStatus.textContent = 'Saving...';
    clearTimeout(state.saveHandle);
    state.saveHandle = setTimeout(saveDraft, 700);
  }

  function restoreDraft() {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.task1_text || data.task2_text) {
        els.task1Text.value = data.task1_text || '';
        els.task2Text.value = data.task2_text || '';
        updateWordCounts();
        showToast('Draft restored from this browser.');
      }
    } catch (_) {
      localStorage.removeItem(draftKey());
    }
  }

  function showToast(message) {
    els.warningToast.textContent = message;
    els.warningToast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.warningToast.classList.remove('show'), 4200);
  }

  function beep() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 220);
    } catch (_) {
      // Audio feedback is optional.
    }
  }

  function playFinishSound() {
    if (!els.finishSoundHost) return;
    const videoId = 'Qt02LiZdEAg';
    els.finishSoundHost.innerHTML = `
      <iframe
        title="End of test sound"
        src="https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&loop=1&playlist=${videoId}&playsinline=1"
        allow="autoplay"
        tabindex="-1"></iframe>
    `;
    setTimeout(beep, 300);
  }

  function showViolationModal(eventType, message) {
    if (!els.violationModal || state.submitted) return;
    els.violationMessage.textContent = message;
    els.violationCountText.textContent = `Vi phạm ${state.violationCount}/${MAX_VIOLATIONS}. Warning ${state.violationCount}/${MAX_VIOLATIONS}. Nếu đủ ${MAX_VIOLATIONS} lần, hệ thống sẽ tự động nộp bài. If you reach ${MAX_VIOLATIONS} violations, the test will be submitted automatically.`;
    els.violationModal.classList.add('show');
    els.violationModal.setAttribute('aria-hidden', 'false');
    els.ackViolationBtn.focus();
    logEvent('VIOLATION_MODAL_SHOWN', { event_type: eventType, violation_count: state.violationCount }, false);
  }

  function closeViolationModal() {
    if (!els.violationModal) return;
    els.violationModal.classList.remove('show');
    els.violationModal.setAttribute('aria-hidden', 'true');
    if (!state.submitted) {
      const activeEditor = document.querySelector('.editor-section.active textarea');
      if (activeEditor) activeEditor.focus();
    }
  }

  function buildBasePayload() {
    return {
      attempt_id: state.attemptId,
      test_id: TEST_ID,
      test_code: TEST_ID,
      student_name: state.studentName,
      email: state.email,
      auth_token: state.authToken,
      event_time: nowIso(),
      elapsed_seconds: elapsedSeconds(),
      violation_count: state.violationCount,
      guest_mode: state.guestMode,
      user_agent: navigator.userAgent,
      screen_size: `${window.innerWidth}x${window.innerHeight}`
    };
  }

  function sendToGas(payload) {
    if (!GAS_URL || state.guestMode) return Promise.resolve(false);
    return fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(() => true).catch(() => false);
  }

  function logEvent(eventType, payload, countsAsViolation) {
    if (!state.started || state.submitted) return;

    const event = {
      type: 'event',
      ...buildBasePayload(),
      event_id: `${state.attemptId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      event_type: eventType,
      payload: payload || {}
    };

    if (countsAsViolation) {
      state.violationCount += 1;
      state.violationSummary[eventType] = (state.violationSummary[eventType] || 0) + 1;
      event.violation_count = state.violationCount;
      updateViolationUI();
    }

    state.events.push(event);
    sendToGas(event);

    if (countsAsViolation && state.violationCount >= MAX_VIOLATIONS) {
      showToast('Violation limit reached. Your test is being submitted.');
      submitFinal('violation_threshold');
    }
  }

  function registerViolation(eventType, message, payload) {
    const now = Date.now();
    const last = state.lastEventAt[eventType] || 0;
    if (now - last < 1200) return;
    state.lastEventAt[eventType] = now;
    showToast(`${message} Violation ${state.violationCount + 1}/${MAX_VIOLATIONS}.`);
    logEvent(eventType, payload, true);
    if (state.violationCount < MAX_VIOLATIONS && !state.submitted) {
      showViolationModal(eventType, message);
    }
  }

  function updateViolationUI() {
    els.violationBadge.textContent = `Violations ${state.violationCount}/${MAX_VIOLATIONS}`;
    els.violationBadge.classList.toggle('danger', state.violationCount >= 3);
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      throw new Error('Trình duyệt không hỗ trợ xác thực bảo mật. Vui lòng dùng Chrome hoặc Edge bản mới.');
    }

    const data = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function setStartBusy(isBusy) {
    els.startBtn.disabled = isBusy;
    els.guestBtn.disabled = isBusy;
    els.startBtn.textContent = isBusy ? 'Đang kiểm tra...' : 'Đăng nhập và bắt đầu';
  }

  async function authenticateStudent(email, password) {
    if (!GAS_URL) {
      return Promise.reject(new Error('Thiếu GAS Web App URL.'));
    }

    const passwordHash = await sha256Hex(password.trim());
    const hashResult = await requestStudentAuth(email, { password_hash: passwordHash });
    if (hashResult.ok || hashResult.auth_token || hashResult.hash_supported) return hashResult;

    return requestStudentAuth(email, { password: password.trim() });
  }

  function requestStudentAuth(email, credentials) {
    return new Promise((resolve, reject) => {
      const callbackName = `saolaAuth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Không kết nối được hệ thống xác thực. Vui lòng kiểm tra deployment Apps Script hoặc dùng Guest Mode để làm thử.'));
      }, 12000);

      function cleanup() {
        clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = data => {
        cleanup();
        resolve(data || {});
      };

      const url = new URL(GAS_URL);
      url.searchParams.set('action', 'auth_student');
      url.searchParams.set('email', email);
      Object.keys(credentials).forEach(key => {
        url.searchParams.set(key, credentials[key]);
      });
      url.searchParams.set('test_id', TEST_ID);
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', String(Date.now()));

      script.onerror = () => {
        cleanup();
        reject(new Error('Không kết nối được hệ thống xác thực. Vui lòng kiểm tra deployment Apps Script hoặc dùng Guest Mode để làm thử.'));
      };
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function enterExamWindow() {
    if (isMobileLike()) {
      els.startError.textContent = 'Bài mock test này chỉ hỗ trợ làm trên máy tính/laptop.';
      setStartBusy(false);
      return false;
    }

    if (!document.documentElement.requestFullscreen) {
      els.startError.textContent = 'Trình duyệt không hỗ trợ fullscreen. Vui lòng dùng Chrome hoặc Edge trên máy tính.';
      setStartBusy(false);
      return false;
    }

    try {
      await document.documentElement.requestFullscreen();
    } catch (_) {
      els.startError.textContent = 'Không thể vào chế độ toàn màn hình. Vui lòng cho phép fullscreen rồi thử lại.';
      setStartBusy(false);
      return false;
    }

    return true;
  }

  function activateExam(options) {
    state.started = true;
    state.authenticated = !options.guestMode;
    state.guestMode = !!options.guestMode;
    state.authToken = options.authToken || '';
    state.studentName = options.studentName || '';
    state.email = options.email || '';
    state.attemptId = createAttemptId();
    state.startedAt = nowIso();
    state.timerRemaining = DURATION_SECONDS;

    document.body.classList.add('exam-running');
    els.submitTopBtn.disabled = false;
    els.attemptLabel.textContent = state.guestMode ? 'Guest mode' : 'Đang làm bài';
    els.saveStatus.textContent = state.guestMode ? 'Guest mode' : 'Not saved';
    restoreDraft();
    updateWordCounts();
    startTimer();
    saveDraft();
    logEvent('START_EXAM', { reason: state.guestMode ? 'guest_started' : 'student_started' }, false);
    els.task1Text.focus();
  }

  async function beginExam(options) {
    const ready = await enterExamWindow();
    if (ready) activateExam(options);
  }

  async function startTest() {
    const email = els.studentEmail.value.trim().toLowerCase();
    const password = els.studentPassword.value;
    els.startError.textContent = '';

    if (!validEmail(email) || !password.trim()) {
      els.startError.textContent = 'Vui lòng kiểm tra lại thông tin hoặc liên hệ giáo viên để nhận tài khoản và mật khẩu.';
      els.studentEmail.focus();
      return;
    }

    setStartBusy(true);
    const ready = await enterExamWindow();
    if (!ready) return;

    try {
      const authResult = await authenticateStudent(email, password);
      if (!authResult.ok) {
        els.startError.textContent = authResult.message || 'Vui lòng kiểm tra lại thông tin hoặc liên hệ giáo viên để nhận tài khoản và mật khẩu.';
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        setStartBusy(false);
        return;
      }

      activateExam({
        email: authResult.email || email,
        studentName: authResult.student_name || authResult.email || email,
        authToken: authResult.auth_token || '',
        guestMode: false
      });
    } catch (err) {
      els.startError.textContent = String(err && err.message ? err.message : err);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setStartBusy(false);
    }
  }

  function startGuestTest() {
    els.startError.textContent = '';
    beginExam({
      email: '',
      studentName: 'Guest Mode',
      guestMode: true
    });
  }

  function startTimer() {
    els.timerDisplay.textContent = fmtTime(state.timerRemaining);
    clearInterval(state.timerHandle);
    state.timerHandle = setInterval(() => {
      if (state.submitted) return;
      state.timerRemaining -= 1;
      els.timerDisplay.textContent = fmtTime(Math.max(0, state.timerRemaining));

      const elapsed = DURATION_SECONDS - state.timerRemaining;
      WARNING_MARKERS.forEach(marker => {
        if (elapsed >= marker.elapsed && !state.warnedMarkers.has(marker.elapsed)) {
          state.warnedMarkers.add(marker.elapsed);
          els.timerDisplay.classList.add('warning');
          setTimeout(() => els.timerDisplay.classList.remove('warning'), 3000);
          beep();
          showToast(marker.message);
          logEvent('TIME_WARNING', { marker_elapsed: marker.elapsed, message: marker.message }, false);
        }
      });

      if (state.timerRemaining <= 0) {
        submitFinal('time_expired');
      }
    }, 1000);
  }

  function switchTask(taskId) {
    document.querySelectorAll('.task-switch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.taskTarget === String(taskId));
    });
    document.querySelectorAll('.editor-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.editorTarget === String(taskId));
    });
    document.querySelectorAll('.prompt-section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.editor-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`promptTask${taskId}`).classList.add('active');
    document.getElementById(`editorTask${taskId}`).classList.add('active');
    document.getElementById(`task${taskId}Text`).focus();
  }

  function openSubmitModal() {
    if (!state.started || state.submitted) return;
    const wc1 = countWords(els.task1Text.value);
    const wc2 = countWords(els.task2Text.value);
    const warnings = [];
    if (wc1 < MIN_WORDS[1]) warnings.push(`Task 1 is below ${MIN_WORDS[1]} words.`);
    if (wc2 < MIN_WORDS[2]) warnings.push(`Task 2 is below ${MIN_WORDS[2]} words.`);

    els.submitSummary.innerHTML = `
      <strong>Task 1:</strong> ${wc1} words<br>
      <strong>Task 2:</strong> ${wc2} words<br>
      <strong>Violations:</strong> ${state.violationCount}/${MAX_VIOLATIONS}
      ${warnings.length ? `<br><br><span class="word-warning">${warnings.join(' ')}</span>` : ''}
    `;
    els.submitModal.classList.add('show');
    els.submitModal.setAttribute('aria-hidden', 'false');
  }

  function closeSubmitModal() {
    els.submitModal.classList.remove('show');
    els.submitModal.setAttribute('aria-hidden', 'true');
  }

  function buildSubmitPayload(reason) {
    const submittedAt = nowIso();
    const task1 = els.task1Text.value.trim();
    const task2 = els.task2Text.value.trim();
    return {
      type: 'writing_submit',
      attempt_id: state.attemptId,
      test_id: TEST_ID,
      test_code: TEST_ID,
      student_name: state.studentName,
      email: state.email,
      auth_token: state.authToken,
      authenticated: state.authenticated,
      guest_mode: state.guestMode,
      started_at: state.startedAt,
      submitted_at: submittedAt,
      duration_seconds: Math.min(DURATION_SECONDS, elapsedSeconds()),
      submit_reason: reason,
      submit_reason_label: submitReasonLabel(reason),
      task1_text: task1,
      task2_text: task2,
      task1_word_count: countWords(task1),
      task2_word_count: countWords(task2),
      violation_count: state.violationCount,
      violation_summary: state.violationSummary,
      anti_cheat_events: state.events,
      user_agent: navigator.userAgent,
      screen_size: `${window.innerWidth}x${window.innerHeight}`
    };
  }

  async function submitFinal(reason) {
    if (state.submitted || !state.started) return;
    closeSubmitModal();
    closeViolationModal();
    clearInterval(state.timerHandle);
    clearTimeout(state.saveHandle);

    if (reason === 'time_expired') {
      playFinishSound();
    }

    if (reason === 'time_expired') {
      logEvent('AUTO_SUBMIT_TIME', { submit_reason: reason, submit_reason_label: submitReasonLabel(reason) }, false);
    } else if (reason === 'violation_threshold') {
      logEvent('AUTO_SUBMIT_VIOLATION', { submit_reason: reason, submit_reason_label: submitReasonLabel(reason) }, false);
    }
    logEvent('FINAL_SUBMIT', { submit_reason: reason, submit_reason_label: submitReasonLabel(reason) }, false);

    state.submitted = true;

    els.task1Text.disabled = true;
    els.task2Text.disabled = true;
    els.submitTopBtn.disabled = true;
    els.saveStatus.textContent = 'Submitting...';

    const payload = buildSubmitPayload(reason);
    localStorage.setItem(`saola_writing_last_submit_${TEST_ID}_${state.attemptId}`, JSON.stringify(payload));
    const sent = state.guestMode ? false : await sendToGas(payload);
    if (sent) {
      localStorage.removeItem(draftKey());
      els.saveStatus.textContent = 'Submitted';
    } else if (state.guestMode) {
      localStorage.removeItem(draftKey());
      els.saveStatus.textContent = 'Guest submitted';
    } else {
      els.saveStatus.textContent = 'Local backup saved';
    }
    showReceipt(payload, sent);
  }

  function showReceipt(payload, sent) {
    els.receiptContent.innerHTML = `
      <table class="receipt-table">
        <tr><td>Mã đề</td><td>${escapeHtml(payload.test_code)}</td></tr>
        <tr><td>Họ và tên</td><td>${escapeHtml(payload.student_name)}</td></tr>
        <tr><td>Email</td><td>${escapeHtml(payload.email || 'Guest Mode')}</td></tr>
        <tr><td>Lý do nộp bài</td><td>${escapeHtml(payload.submit_reason_label)}</td></tr>
        <tr><td>Task 1 word count</td><td>${escapeHtml(payload.task1_word_count)}</td></tr>
        <tr><td>Task 2 word count</td><td>${escapeHtml(payload.task2_word_count)}</td></tr>
        <tr><td>Violations</td><td>${escapeHtml(payload.violation_count)}</td></tr>
      </table>
      <p>${payload.guest_mode ? 'Bạn đã làm bài ở Guest Mode nên kết quả không được gửi tới giáo viên phụ trách.' : 'Học viên Saola có thể dùng email đã nhập để nhận feedback Writing chuyên sâu từ giáo viên.'}</p>
    `;
    els.receiptModal.classList.add('show');
    els.receiptModal.setAttribute('aria-hidden', 'false');
  }

  function blockClipboard(event, type) {
    if (!state.started || state.submitted) return;
    event.preventDefault();
    if (type === 'PASTE_BLOCKED') {
      registerViolation(type, 'Không được paste nội dung trong bài test. Paste is not allowed during the test.', { source: event.type });
    } else {
      logEvent(type, { source: event.type }, false);
      showToast('Không được copy/cut trong bài test. Copy/cut is disabled during the test.');
    }
  }

  function setupAntiCheat() {
    document.addEventListener('fullscreenchange', () => {
      if (!state.started || state.submitted) return;
      if (!document.fullscreenElement) {
        registerViolation('FULLSCREEN_EXIT', 'Bạn đã thoát toàn màn hình. You exited fullscreen mode.');
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!state.started || state.submitted) return;
      if (document.hidden) {
        registerViolation('TAB_SWITCH', 'Bạn đã rời tab bài test. You left the test tab.');
      }
    });

    window.addEventListener('blur', () => {
      if (!state.started || state.submitted) return;
      registerViolation('WINDOW_BLUR', 'Cửa sổ bài test bị mất focus. The test window lost focus.');
    });

    document.addEventListener('paste', event => blockClipboard(event, 'PASTE_BLOCKED'));
    document.addEventListener('copy', event => blockClipboard(event, 'COPY_BLOCKED'));
    document.addEventListener('cut', event => blockClipboard(event, 'CUT_BLOCKED'));

    document.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ['v', 'c', 'x'].includes(key)) {
        const type = key === 'v' ? 'PASTE_BLOCKED' : (key === 'c' ? 'COPY_BLOCKED' : 'CUT_BLOCKED');
        blockClipboard(event, type);
      }
    });

    document.addEventListener('contextmenu', event => {
      if (!state.started || state.submitted) return;
      event.preventDefault();
      logEvent('RIGHT_CLICK_BLOCKED', { source: 'contextmenu' }, false);
      showToast('Không được click chuột phải trong bài test. Right click is disabled during the test.');
    });
  }

  function setupSplitHandle() {
    if (!els.writingShell || !els.splitHandle) return;

    const setPercent = percent => {
      const next = Math.max(34, Math.min(66, percent));
      els.writingShell.style.setProperty('--prompt-w', `${next}%`);
      els.splitHandle.setAttribute('aria-valuenow', String(Math.round(next)));
    };

    els.splitHandle.addEventListener('pointerdown', event => {
      event.preventDefault();
      els.splitHandle.setPointerCapture(event.pointerId);

      const onMove = moveEvent => {
        const rect = els.writingShell.getBoundingClientRect();
        const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
        setPercent(percent);
      };

      const onUp = upEvent => {
        els.splitHandle.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    els.splitHandle.addEventListener('keydown', event => {
      const current = parseFloat(getComputedStyle(els.writingShell).getPropertyValue('--prompt-w')) || 52;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPercent(current - 3);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPercent(current + 3);
      }
    });
  }

  els.startBtn.addEventListener('click', startTest);
  els.guestBtn.addEventListener('click', startGuestTest);
  els.ackViolationBtn.addEventListener('click', closeViolationModal);
  els.submitTopBtn.addEventListener('click', openSubmitModal);
  els.cancelSubmitBtn.addEventListener('click', closeSubmitModal);
  els.confirmSubmitBtn.addEventListener('click', () => submitFinal('user_submit'));
  els.task1Text.addEventListener('input', scheduleSave);
  els.task2Text.addEventListener('input', scheduleSave);

  document.querySelectorAll('.task-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTask(btn.dataset.taskTarget));
  });
  document.querySelectorAll('.editor-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTask(btn.dataset.editorTarget));
  });

  window.addEventListener('beforeunload', event => {
    if (state.started && !state.submitted) {
      saveDraft();
      logEvent('PAGE_UNLOAD', { reason: 'beforeunload' }, true);
      event.preventDefault();
      event.returnValue = '';
    }
  });

  updateWordCounts();
  setupSplitHandle();
  setupAntiCheat();
})();
