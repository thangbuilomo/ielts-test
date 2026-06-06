const GAS_URL = 'https://script.google.com/macros/s/AKfycbz6mSuAhOl6yIEfuYYLPUvi4LAjTOTwA0t3ik5MBi515I7twRBsWNLR-2apjRwqQgPbFw/exec';

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
  
  // Graded results
  gradedResult: null,
  
  // Status
  isSubmitted: false
};

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  state.testId = urlParams.get('test');
  if (!state.testId) {
    alert("Không tìm thấy mã bài test. Trở về trang chủ.");
    window.location.href = 'index.html';
    return;
  }
  
  document.getElementById('testTitleGate').textContent = `Reading Mock Test: ${state.testId}`;
  
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
        test_id: `Vol9_Reading_${state.testId}`
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
    
    // Fetch JSONs
    const [manifestRes, contentRes, questionsRes] = await Promise.all([
      fetch(basePath + 'manifest.json'),
      fetch(basePath + 'content.json'),
      fetch(basePath + 'questions.json')
    ]);
    
    state.manifest = await manifestRes.json();
    state.content = await contentRes.json();
    state.questions = await questionsRes.json();
    
    document.getElementById('headerTestTitle').textContent = state.manifest.title || state.testId;
    
    renderPassages();
    renderQuestions();
    setupNavigation();
    
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
  
  state.content.passages.forEach((p, idx) => {
    // Tab
    const btn = document.createElement('button');
    btn.className = `passage-tab-btn ${idx === 0 ? 'active' : ''}`;
    btn.textContent = `Passage ${idx + 1}`;
    btn.dataset.target = `passage-${idx}`;
    btn.addEventListener('click', () => switchPassage(idx));
    tabsContainer.appendChild(btn);
    
    // Content
    const div = document.createElement('div');
    div.className = `passage-content ${idx === 0 ? 'active' : ''}`;
    div.id = `passage-${idx}`;
    
    let html = `<h2>${p.title}</h2>`;
    p.paragraphs.forEach(para => {
      html += `<p id="${para.id}">${para.text}</p>`;
    });
    
    div.innerHTML = html;
    contentContainer.appendChild(div);
  });
}

function switchPassage(idx) {
  document.querySelectorAll('.passage-tab-btn').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.passage-content').forEach((c, i) => {
    c.classList.toggle('active', i === idx);
  });
}

// --- Rendering Questions ---

function renderQuestions() {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';
  
  if (!state.questions.question_groups) {
    console.error('No question_groups found in state.questions');
    return;
  }
  
  state.questions.question_groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'question-group-card';
    
    let html = `<h3>Questions ${group.question_range ? group.question_range.join(' - ') : ''}</h3>`;
    if (group.instruction) {
      html += `<div class="instruction-box">${group.instruction}</div>`;
    }
    
    // Process <blank> tags in prompt_html
    if (group.prompt_html) {
      let processedPrompt = group.prompt_html;
      // Handle escaped and unescaped blank tags
      processedPrompt = processedPrompt.replace(/&lt;blank data-qid=&quot;([^&"]+)&quot;\/?&gt;/g, '<input type="text" class="blank-input input-element" data-qid="$1" onkeyup="saveAnswer(\'$1\', this.value)">');
      processedPrompt = processedPrompt.replace(/<blank data-qid="([^"]+)"\s*\/>/g, '<input type="text" class="blank-input input-element" data-qid="$1" onkeyup="saveAnswer(\'$1\', this.value)">');
      html += `<div class="prompt-box">${processedPrompt}</div>`;
    }
    
    const groupBody = document.createElement('div');
    groupBody.innerHTML = html;
    
    // Render specific question types from items
    if (group.items && group.items.length > 0) {
      group.items.forEach(q => {
        const qid = q.question_id || q.id;
        const qDiv = document.createElement('div');
        qDiv.id = `question-container-${qid}`;
        qDiv.style.marginBottom = '20px';
        qDiv.style.padding = '10px';
        qDiv.style.background = '#f8fafc';
        qDiv.style.borderRadius = '8px';
        
        let qHtml = `<strong>${q.number}.</strong> `;
        
        // If it's a completion type, the blank is usually in prompt_html, so we don't need to render much here,
        // EXCEPT if the item itself has a prompt_html that needs a blank.
        let itemText = q.prompt_html || q.text || '';
        itemText = itemText.replace(/&lt;blank data-qid=&quot;([^&"]+)&quot;\/?&gt;/g, '<input type="text" class="blank-input input-element" data-qid="$1" onkeyup="saveAnswer(\'$1\', this.value)">');
        itemText = itemText.replace(/<blank data-qid="([^"]+)"\s*\/>/g, '<input type="text" class="blank-input input-element" data-qid="$1" onkeyup="saveAnswer(\'$1\', this.value)">');
        
        const qType = group.question_type || q.type || '';
        
        if (qType.includes('tfng') || qType.includes('ynng') || qType === 'yes_no_not_given') {
          qHtml += `${itemText} <br><div style="margin-top: 8px;">
            <label class="mcq-option"><input type="radio" name="q_${qid}" value="${qType.includes('tfng') ? 'TRUE' : 'YES'}" class="input-element" onchange="saveAnswer('${qid}', this.value)"> <span>${qType.includes('tfng') ? 'TRUE' : 'YES'}</span></label>
            <label class="mcq-option"><input type="radio" name="q_${qid}" value="${qType.includes('tfng') ? 'FALSE' : 'NO'}" class="input-element" onchange="saveAnswer('${qid}', this.value)"> <span>${qType.includes('tfng') ? 'FALSE' : 'NO'}</span></label>
            <label class="mcq-option"><input type="radio" name="q_${qid}" value="NOT GIVEN" class="input-element" onchange="saveAnswer('${qid}', this.value)"> <span>NOT GIVEN</span></label>
          </div>`;
        } 
        else if (qType.includes('matching')) {
          let optionsHtml = '<option value="">-- Select --</option>';
          const opts = group.options || group.choices || [];
          opts.forEach(c => {
             optionsHtml += `<option value="${c.label}">${c.label} - ${c.text.substring(0,30)}...</option>`;
          });
          qHtml += `${itemText} <br><select style="margin-top: 8px;" class="matching-select input-element" data-qid="${qid}" onchange="saveAnswer('${qid}', this.value)">${optionsHtml}</select>`;
        }
        else if (qType.includes('mcq')) {
          qHtml += `${itemText}<div style="margin-top: 10px;">`;
          const opts = q.options || group.options || [];
          opts.forEach(opt => {
            qHtml += `<label class="mcq-option" id="opt-${qid}-${opt.label}">
              <input type="${qType.includes('multi') ? 'checkbox' : 'radio'}" name="q_${qid}" value="${opt.label}" class="input-element" onchange="saveAnswer('${qid}', this.value)">
              <span><strong>${opt.label}</strong>. ${opt.text}</span>
            </label>`;
          });
          qHtml += `</div>`;
        }
        else if (qType.includes('completion') || qType.includes('short_answer')) {
           // For completion, if there is item text without blanks, we can append an input box
           if (!itemText.includes('<input')) {
             qHtml += `${itemText} <br><input type="text" style="margin-top: 8px;" class="blank-input input-element" data-qid="${qid}" onkeyup="saveAnswer('${qid}', this.value)">`;
           } else {
             qHtml += itemText;
           }
        }
        else {
           // fallback text input
           qHtml += `${itemText} <br><input type="text" style="margin-top: 8px;" class="blank-input input-element" data-qid="${qid}" onkeyup="saveAnswer('${qid}', this.value)">`;
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
}

window.saveAnswer = function(qid, value) {
  if (state.isSubmitted) return;
  state.answers[qid] = value.trim();
  updateNavDots();
};

// --- Navigation ---
function setupNavigation() {
  const nav = document.getElementById('navigationBar');
  nav.innerHTML = '';
  
  let qNum = 1;
  if (!state.questions.question_groups) return;
  state.questions.question_groups.forEach(group => {
    if (group.items) {
      group.items.forEach(q => {
        const qid = q.question_id || q.id;
        const dot = document.createElement('div');
        dot.className = 'nav-dot';
        dot.textContent = q.number || qNum++;
        dot.id = `nav-dot-${qid}`;
        dot.onclick = () => {
          // Toggle review state
          state.reviews[qid] = !state.reviews[qid];
          updateNavDots();
          const el = document.getElementById(`question-container-${qid}`);
          if (el) el.scrollIntoView({behavior: 'smooth', block: 'center'});
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
  
  if (state.questions.question_groups) {
    state.questions.question_groups.forEach(g => {
      if (g.items) {
        g.items.forEach(q => {
          const qid = q.question_id || q.id;
          total++;
          if (state.answers[qid] && state.answers[qid].trim() !== '') answered++;
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
  
  const payload = {
    type: 'reading_submit',
    guest_mode: state.mode === 'guest',
    email: state.studentData ? state.studentData.email : 'guest@local',
    student_name: state.studentData ? state.studentData.student_name : 'Guest',
    auth_token: state.studentData ? state.studentData.auth_token : '',
    test_id: `Vol9_Reading_${state.testId}`,
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
      headers: { 'Content-Type': 'text/plain;charset=utf-8' } // text/plain to bypass CORS preflight
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
