const GAS_URL = 'https://script.google.com/macros/s/AKfycbz6mSuAhOl6yIEfuYYLPUvi4LAjTOTwA0t3ik5MBi515I7twRBsWNLR-2apjRwqQgPbFw/exec';

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
  isSubmitted: false,
  
  // Audio specific
  audioElement: null,
  audioDuration: 0,
  postAudioTimerInterval: null,
  postAudioSecondsRemaining: 0,
  isAudioFinished: false
};

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  state.testId = urlParams.get('test');
  if (!state.testId) {
    alert("Không tìm thấy mã bài test. Trở về trang chủ.");
    window.location.href = 'index.html';
    return;
  }
  
  document.getElementById('testTitleGate').textContent = `Listening Mock Test: ${state.testId}`;
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
      const response = await jsonpFetch(GAS_URL, {
        action: 'auth_student',
        email: email,
        password: password,
        test_id: `Vol9_Listening_${state.testId}`
      });
      
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
      loginBtn.textContent = 'Đang nhập & Bắt đầu';
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
    
    const [manifestRes, contentRes, questionsRes] = await Promise.all([
      fetch(basePath + 'manifest.json'),
      fetch(basePath + 'content.json'),
      fetch(basePath + 'questions.json')
    ]);
    
    state.manifest = await manifestRes.json();
    state.content = await contentRes.json();
    state.questions = await questionsRes.json();
    
    document.getElementById('headerTestTitle').textContent = state.manifest.title || state.testId;
    
    renderQuestions();
    setupNavigation();
    setupAudioPlayer();
    
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

function startPostAudioCountdown(seconds) {
  state.postAudioSecondsRemaining = seconds;
  const display = document.getElementById('timerDisplay');
  
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
  
  state.questions.parts.forEach(part => {
    const partTitle = document.createElement('h2');
    partTitle.textContent = part.title;
    partTitle.style.fontFamily = 'var(--display-font)';
    partTitle.style.marginTop = '40px';
    partTitle.style.borderBottom = '2px solid var(--border-color)';
    partTitle.style.paddingBottom = '10px';
    container.appendChild(partTitle);

    part.groups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'question-group-card';
      
      let html = `<h3>Questions ${group.start_question} - ${group.end_question}</h3>`;
      if (group.instructions) {
        html += `<div class="instruction-box">${group.instructions}</div>`;
      }
      if (group.prompt) {
        html += `<div class="prompt-box">${group.prompt}</div>`;
      }
      
      const groupBody = document.createElement('div');
      groupBody.innerHTML = html;
      
      group.questions.forEach(q => {
        const qDiv = document.createElement('div');
        qDiv.id = `question-container-${q.id}`;
        qDiv.style.marginBottom = '20px';
        
        let qHtml = `<strong>${q.number}.</strong> `;
        
        if (q.type === 'multiple_choice' || q.type === 'mcq_single' || q.type === 'mcq_multi') {
          qHtml += `${q.text}<div style="margin-top: 10px;">`;
          q.options.forEach(opt => {
            qHtml += `<label class="mcq-option" id="opt-${q.id}-${opt.label}">
              <input type="${q.type === 'mcq_multi' ? 'checkbox' : 'radio'}" name="q_${q.id}" value="${opt.label}" class="input-element" onchange="saveAnswer('${q.id}', this.value)">
              <span><strong>${opt.label}</strong>. ${opt.text}</span>
            </label>`;
          });
          qHtml += `</div>`;
        }
        else if (q.type === 'matching_headings' || q.type === 'matching_features' || q.type === 'matching_information') {
          let optionsHtml = '<option value="">-- Select --</option>';
          if(group.choices) {
            group.choices.forEach(c => {
               optionsHtml += `<option value="${c.label}">${c.label} - ${c.text.substring(0,30)}...</option>`;
            });
          }
          qHtml += `${q.text} <br><select class="matching-select input-element" data-qid="${q.id}" onchange="saveAnswer('${q.id}', this.value)">${optionsHtml}</select>`;
        }
        else if (q.type === 'completion') {
           let text = q.text.replace(/\[BLANK\]/g, `<input type="text" class="blank-input input-element" data-qid="${q.id}" onkeyup="saveAnswer('${q.id}', this.value)">`);
           qHtml += text;
        }
        else {
           qHtml += `${q.text} <br><input type="text" class="blank-input input-element" data-qid="${q.id}" onkeyup="saveAnswer('${q.id}', this.value)">`;
        }
        
        qDiv.innerHTML = qHtml;
        
        const expDiv = document.createElement('div');
        expDiv.id = `explanation-${q.id}`;
        expDiv.style.display = 'none';
        qDiv.appendChild(expDiv);
        
        groupBody.appendChild(qDiv);
      });
      
      card.appendChild(groupBody);
      container.appendChild(card);
    });
  });
  
  const submitBtn = document.createElement('button');
  submitBtn.className = 'start-test-btn';
  submitBtn.textContent = 'Hoàn thành & Nộp bài';
  submitBtn.style.marginTop = '20px';
  submitBtn.onclick = checkUnanswered;
  container.appendChild(submitBtn);
}

window.saveAnswer = function(qid, value) {
  if (state.isSubmitted) return;
  state.answers[qid] = value.trim();
  updateNavDots();
};

function setupNavigation() {
  const nav = document.getElementById('navigationBar');
  nav.innerHTML = '';
  
  let qNum = 1;
  state.questions.parts.forEach(part => {
    part.groups.forEach(group => {
      group.questions.forEach(q => {
        const dot = document.createElement('div');
        dot.className = 'nav-dot';
        dot.textContent = q.number || qNum++;
        dot.id = `nav-dot-${q.id}`;
        dot.onclick = () => {
          document.getElementById(`question-container-${q.id}`).scrollIntoView({behavior: 'smooth', block: 'center'});
        };
        nav.appendChild(dot);
      });
    });
  });
}

function updateNavDots() {
  for (let qid in state.answers) {
    const dot = document.getElementById(`nav-dot-${qid}`);
    if (dot) {
      if (state.answers[qid] && state.answers[qid].length > 0) {
        dot.classList.add('answered');
      } else {
        dot.classList.remove('answered');
      }
    }
  }
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
  
  state.questions.parts.forEach(p => p.groups.forEach(g => g.questions.forEach(q => {
    total++;
    if (state.answers[q.id] && state.answers[q.id].trim() !== '') answered++;
  })));
  
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
  
  const payload = {
    type: 'listening_submit',
    guest_mode: state.mode === 'guest',
    email: state.studentData ? state.studentData.email : 'guest@local',
    student_name: state.studentData ? state.studentData.student_name : 'Guest',
    auth_token: state.studentData ? state.studentData.auth_token : '',
    test_id: `Vol9_Listening_${state.testId}`,
    attempt_id: 'atm_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    submitted_at: new Date().toISOString(),
    answers_json: state.answers,
    violation_count: state.violationCount,
    anti_cheat_events: state.events
  };

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    
    const result = await res.json();
    
    if (result.ok && result.result && result.result.feedback) {
      processFeedback(result.result.feedback);
    } else {
      alert("Nộp bài thành công nhưng không lấy được đáp án từ máy chủ.");
    }
  } catch(e) {
    alert("Nộp bài thành công (hoặc lỗi mạng). " + e.message);
    console.error(e);
  } finally {
    document.getElementById('loadingModal').style.display = 'none';
  }
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
        html += `<div style="line-height: 1.6; font-size: 1.05rem;">${part.annotated_transcript_html}</div>`;
      }
    });
  } else {
    html += '<p>Không có Transcript được lưu cho bài này.</p>';
  }
  
  container.innerHTML = html;
}

// --- Resizer Logic ---
function setupResizer() {
  const resizer = document.getElementById('dragResizer');
  const leftSide = document.getElementById('leftPanel');
  const rightSide = document.getElementById('rightPanel');
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', () => {
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
    }, { once: true });
  });

  function handleMouseMove(e) {
    if (!isResizing) return;
    const containerWidth = document.getElementById('splitContainer').offsetWidth;
    if (e.clientX > 300 && e.clientX < containerWidth - 300) {
      const leftWidth = (e.clientX / containerWidth) * 100;
      leftSide.style.width = `${leftWidth}%`;
      rightSide.style.width = `${100 - leftWidth}%`;
    }
  }
}
