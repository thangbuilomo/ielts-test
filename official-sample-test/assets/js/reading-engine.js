// IELTS Reading Engine - Saola Tests

let testData = null;
let userAnswers = {};
let userReviews = {};
let timerInterval = null;
let secondsRemaining = 600; // Default 10 minutes
let isSubmitted = false;

document.addEventListener('DOMContentLoaded', () => {
  initResizer();
  loadTestData();
  setupEventListeners();
  checkDevice();
});

// Device check
function checkDevice() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;
  if (isMobile) {
    document.getElementById('mobileWarning').style.display = 'flex';
  }
}
window.addEventListener('resize', checkDevice);

window.toggleReview = function(qid) {
  userReviews[qid] = !userReviews[qid];
  updateNavigation();
};

// Resizer logic
function initResizer() {
  const resizer = document.getElementById('resizer');
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');
  const container = document.getElementById('splitContainer');

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  });

  function resize(e) {
    const containerWidth = container.clientWidth;
    const leftWidth = (e.clientX / containerWidth) * 100;
    if (leftWidth > 20 && leftWidth < 80) {
      leftPanel.style.width = `${leftWidth}%`;
      rightPanel.style.width = `${100 - leftWidth}%`;
    }
  }

  function stopResize() {
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
  }
}

// Load test data from JSON
async function loadTestData() {
  const urlParams = new URLSearchParams(window.location.search);
  const taskFile = urlParams.get('task');
  if (!taskFile) {
    alert("Không tìm thấy bài test!");
    window.location.href = "index.html";
    return;
  }

  try {
    const response = await fetch(`data/reading/${taskFile}`);
    testData = await response.json();
    
    // Set headers
    document.getElementById('startTestTitle').innerText = testData.title;
    document.getElementById('testTitleHeader').innerText = testData.title;
    
    secondsRemaining = testData.duration_seconds || 600; // Default 10 minutes
    updateTimerDisplay();

    renderPassages();
    renderQuestions();
    renderNavigation();
    
    // Initialize highlighter
    new Highlighter('#passageText');

  } catch (error) {
    console.error("Lỗi khi tải dữ liệu bài test:", error);
    alert("Không thể tải dữ liệu bài test.");
  }
}

// Event listeners
function setupEventListeners() {
  document.getElementById('startTestBtn').addEventListener('click', () => {
    document.getElementById('startGate').style.removeProperty('display');
    document.getElementById('startGate').style.display = 'none';
    startTimer();
  });

  document.getElementById('submitBtn').addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn nộp bài?")) {
      submitTest();
    }
  });

  // Help Modal logic
  const helpBtn = document.getElementById('openHelpBtn');
  const closeHelpBtn = document.getElementById('closeHelpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpContent = document.getElementById('helpContent');
  const helpModalContent = document.getElementById('helpModalContent');

  if (helpBtn && helpModal && helpContent && helpModalContent) {
    helpBtn.addEventListener('click', () => {
      helpModalContent.innerHTML = helpContent.innerHTML;
      helpModal.style.display = 'flex';
    });
    closeHelpBtn.addEventListener('click', () => {
      helpModal.style.display = 'none';
    });
  }
}

// Timer
function startTimer() {
  timerInterval = setInterval(() => {
    secondsRemaining--;
    updateTimerDisplay();
    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      alert("Hết giờ làm bài! Hệ thống tự động nộp bài.");
      submitTest();
    }
  }, 1000);
}

// Render Timer Display
function updateTimerDisplay() {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  document.getElementById('timerDisplay').innerText = 
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Render Passages
function renderPassages() {
  const tabsContainer = document.getElementById('passageTabs');
  const passageText = document.getElementById('passageText');
  
  tabsContainer.innerHTML = '';
  passageText.innerHTML = '';

  if (!testData.passages || testData.passages.length === 0) {
    passageText.innerHTML = "<p>Nội dung bài đọc không được chỉ định.</p>";
    return;
  }

  testData.passages.forEach((passage, idx) => {
    // Render Tab Button
    const btn = document.createElement('button');
    btn.className = `passage-tab-btn ${idx === 0 ? 'active' : ''}`;
    btn.innerText = passage.title || `Passage ${idx + 1}`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.passage-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.passage-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`passage-content-${idx}`).classList.add('active');
    });
    tabsContainer.appendChild(btn);

    // Render Content
    const contentDiv = document.createElement('div');
    contentDiv.id = `passage-content-${idx}`;
    contentDiv.className = `passage-content ${idx === 0 ? 'active' : ''}`;
    
    let paragraphsHtml = '';
    if (passage.paragraphs) {
      paragraphsHtml = passage.paragraphs.map(p => `<p>${p}</p>`).join('');
    }
    
    contentDiv.innerHTML = `
      <h2>${passage.title}</h2>
      ${passage.note ? `<p style="font-style: italic; color: var(--text-secondary);">${passage.note}</p>` : ''}
      ${paragraphsHtml}
    `;
    passageText.appendChild(contentDiv);
  });
}

// Render Questions
function renderQuestions() {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';

  testData.parts.forEach(part => {
    part.groups.forEach(group => {
      const groupCard = document.createElement('div');
      groupCard.className = 'question-group-card';
      
      // Instruction
      const instruction = document.createElement('div');
      instruction.className = 'instruction-box';
      instruction.innerHTML = group.instruction;
      groupCard.appendChild(instruction);

      // Render group-level prompt_html if it exists but doesn't have blanks (like maps, diagrams, tables, context)
      if (group.prompt_html && !group.prompt_html.includes('<blank')) {
        const descDiv = document.createElement('div');
        descDiv.className = 'group-prompt-desc';
        descDiv.style.marginBottom = '20px';
        descDiv.innerHTML = group.prompt_html;
        
        // Correct relative path for local images inside group.prompt_html
        descDiv.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src');
          if (src && !src.startsWith('http') && !src.startsWith('data')) {
            const filename = src.substring(src.lastIndexOf('/') + 1);
            img.setAttribute('src', `data/reading/${filename}`);
          }
        });
        groupCard.appendChild(descDiv);
      }

      // Render questions based on group type
      if (group.type === 'matching_features') {
        const list = document.createElement('div');
        list.className = 'matching-list';
        
        // Display options list
        const optionsList = document.createElement('div');
        optionsList.style.marginBottom = '16px';
        optionsList.style.padding = '10px';
        optionsList.style.background = 'rgba(0,0,0,0.03)';
        optionsList.style.borderRadius = '6px';
        optionsList.innerHTML = group.options.map(opt => `<strong>${opt.label}</strong>: ${opt.text}`).join('<br>');
        groupCard.appendChild(optionsList);

        group.items.forEach(item => {
          const li = document.createElement('div');
          li.style.marginBottom = '12px';
          li.innerHTML = `<strong>${item.number}.</strong> ${item.prompt_html}`;
          
          const select = document.createElement('select');
          select.className = 'matching-select';
          select.dataset.qid = item.id;
          select.innerHTML = '<option value="">-- Select --</option>' + 
            group.options.map(opt => `<option value="${opt.label}">${opt.label}</option>`).join('');
          
          select.addEventListener('change', (e) => {
            saveAnswer(item.id, e.target.value);
          });

          li.appendChild(select);
          list.appendChild(li);
        });
        groupCard.appendChild(list);
      } 
      else if (group.type === 'multiple_choice' || group.type === 'mcq_single') {
        group.items.forEach(item => {
          const qBlock = document.createElement('div');
          qBlock.style.marginBottom = '20px';
          qBlock.innerHTML = `<p><strong>Question ${item.number}:</strong> ${item.prompt_html}</p>`;
          
          const optionsDiv = document.createElement('div');
          optionsDiv.className = 'mcq-group';
          
          const options = item.options || group.options || [];
          options.forEach(opt => {
            const label = document.createElement('label');
            label.className = 'mcq-option';
            label.innerHTML = `
              <input type="radio" name="${item.id}" value="${opt.label}" data-qid="${item.id}">
              <span><strong>${opt.label}</strong>. ${opt.text}</span>
            `;
            
            label.querySelector('input').addEventListener('change', (e) => {
              saveAnswer(item.id, e.target.value);
            });
            optionsDiv.appendChild(label);
          });
          qBlock.appendChild(optionsDiv);
          groupCard.appendChild(qBlock);
        });
      } 
      else if (group.type === 'mcq_multi') {
        group.items.forEach(item => {
          const qBlock = document.createElement('div');
          qBlock.style.marginBottom = '20px';
          qBlock.innerHTML = `<p><strong>Question ${item.number}:</strong> ${item.prompt_html}</p>`;
          
          const optionsDiv = document.createElement('div');
          optionsDiv.className = 'mcq-group';
          
          const options = item.options || group.options || [];
          options.forEach(opt => {
            const label = document.createElement('label');
            label.className = 'mcq-option';
            label.innerHTML = `
              <input type="checkbox" name="${item.id}" value="${opt.label}" data-qid="${item.id}">
              <span><strong>${opt.label}</strong>. ${opt.text}</span>
            `;
            
            label.querySelector('input').addEventListener('change', () => {
              const selected = Array.from(optionsDiv.querySelectorAll('input:checked')).map(i => i.value);
              saveAnswer(item.id, selected);
            });
            optionsDiv.appendChild(label);
          });
          qBlock.appendChild(optionsDiv);
          groupCard.appendChild(qBlock);
        });
      }
      else if (group.prompt_html && group.prompt_html.includes('<blank')) {
        const promptBlock = document.createElement('div');
        promptBlock.className = 'prompt-box';
        
        let html = group.prompt_html;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        const blanks = tempDiv.querySelectorAll('blank');
        blanks.forEach(blank => {
          const qid = blank.getAttribute('data-qid');
          const item = group.items.find(i => i.id === qid);
          const num = item ? item.number : '?';
          
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'blank-input';
          input.dataset.qid = qid;
          input.placeholder = `[${num}]`;
          input.addEventListener('input', (e) => {
            saveAnswer(qid, e.target.value.trim());
          });
          
          blank.replaceWith(input);
        });
        
        promptBlock.innerHTML = tempDiv.innerHTML;

        setTimeout(() => {
          container.querySelectorAll('.blank-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
              saveAnswer(inp.dataset.qid, e.target.value.trim());
            });
          });
        }, 100);

        groupCard.appendChild(promptBlock);
      }
      else {
        const list = document.createElement('div');
        list.className = 'question-list';
        group.items.forEach(item => {
          const li = document.createElement('div');
          li.style.marginBottom = '12px';
          
          let html = item.prompt_html;
          if (html.includes('<blank/>') || html.includes('<blank />')) {
            html = html.replace(/<blank\s*\/?>/, `<input type="text" class="blank-input" data-qid="${item.id}" placeholder="[${item.number}]">`);
          } else {
            html = `${html} <input type="text" class="blank-input" data-qid="${item.id}" placeholder="[${item.number}]">`;
          }
          
          li.innerHTML = `<strong>${item.number}.</strong> ${html}`;
          
          setTimeout(() => {
            const inp = container.querySelector(`input[data-qid="${item.id}"]`);
            if (inp) {
              inp.addEventListener('input', (e) => {
                saveAnswer(item.id, e.target.value.trim());
              });
            }
          }, 100);
          
          list.appendChild(li);
        });
        groupCard.appendChild(list);
      }

      container.appendChild(groupCard);
    });
  });
}

// Save answers
function saveAnswer(qid, val) {
  if (isSubmitted) return;
  userAnswers[qid] = val;
  updateNavigation();
}

// Render navigation bar
function renderNavigation() {
  const bar = document.getElementById('navigationBar');
  bar.innerHTML = '';

  let idx = 1;
  testData.parts.forEach(part => {
    part.groups.forEach(group => {
      group.items.forEach(item => {
        const dot = document.createElement('div');
        dot.className = 'nav-dot';
        dot.innerText = idx;
        dot.dataset.qid = item.id;
        
        dot.addEventListener('click', () => {
          userReviews[item.id] = !userReviews[item.id];
          updateNavigation();
          const el = document.querySelector(`[data-qid="${item.id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus();
          }
        });
        
        bar.appendChild(dot);
        idx++;
      });
    });
  });
}

function updateNavigation() {
  document.querySelectorAll('.nav-dot').forEach(dot => {
    const qid = dot.dataset.qid;
    dot.classList.remove('answered', 'review');
    
    if (userReviews[qid]) {
      dot.classList.add('review');
    } else if (userAnswers[qid] && userAnswers[qid].length > 0) {
      dot.classList.add('answered');
    }
  });
}

// Grade and show post test review
function submitTest() {
  isSubmitted = true;
  clearInterval(timerInterval);
  document.getElementById('submitBtn').style.display = 'none';

  let score = 0;
  let totalQuestions = 0;
  const answerKey = testData.answer_key;
  
  testData.parts.forEach(part => {
    part.groups.forEach(group => {
      totalQuestions += group.items.length;
    });
  });

  const resultsDiv = document.getElementById('resultsContainer');
  resultsDiv.innerHTML = '<h2>Chi tiết đáp án & Giải thích</h2>';
  resultsDiv.style.display = 'block';

  // Grade inputs and dropdowns
  document.querySelectorAll('input.blank-input, select.matching-select').forEach(el => {
    const qid = el.dataset.qid;
    const uAns = (userAnswers[qid] || '').toString().trim().toLowerCase();
    const correctAnswers = (answerKey[qid] ? answerKey[qid].accepted : []).map(a => a.toLowerCase());
    
    const isCorrect = correctAnswers.includes(uAns);
    if (isCorrect) {
      el.classList.add('correct');
      score++;
    } else {
      el.classList.add('incorrect');
    }
    el.disabled = true;
  });

  // Grade MCQs
  document.querySelectorAll('.mcq-group').forEach(group => {
    const inputs = group.querySelectorAll('input');
    if (inputs.length === 0) return;
    const qid = inputs[0].dataset.qid;
    const correctAnswers = (answerKey[qid] ? answerKey[qid].accepted : []).map(a => a.toLowerCase());

    inputs.forEach(input => {
      const uVal = input.value.toLowerCase();
      const parentLabel = input.closest('.mcq-option');
      if (input.checked) {
        if (correctAnswers.includes(uVal)) {
          parentLabel.classList.add('correct');
        } else {
          parentLabel.classList.add('incorrect');
        }
      } else if (correctAnswers.includes(uVal)) {
        parentLabel.classList.add('correct');
      }
      input.disabled = true;
    });

    const isCorrect = Array.from(inputs)
      .filter(i => i.checked)
      .map(i => i.value.toLowerCase())
      .every(v => correctAnswers.includes(v)) && 
      Array.from(inputs).filter(i => i.checked).length === correctAnswers.length;

    if (isCorrect) score++;
  });

  // Show score
  const scoreCard = document.createElement('div');
  scoreCard.className = 'score-box';
  scoreCard.innerHTML = `
    <h3>Kết quả bài làm</h3>
    <div class="score-value">${score}/${totalQuestions}</div>
    <p>Số câu trả lời đúng của bạn.</p>
  `;
  resultsDiv.appendChild(scoreCard);

  // Render Detailed Explanations
  testData.parts.forEach(part => {
    part.groups.forEach(group => {
      group.items.forEach(item => {
        const qid = item.id;
        const review = answerKey[qid];
        if (!review) return;

        const uAns = userAnswers[qid] || 'Không có câu trả lời';
        const correctAnswers = review.accepted.join(' / ');
        const isCorrect = review.accepted.map(a => a.toLowerCase()).includes(uAns.toString().trim().toLowerCase());

        const card = document.createElement('div');
        card.className = `review-card ${isCorrect ? 'correct' : 'incorrect'}`;
        card.innerHTML = `
          <span class="review-badge ${isCorrect ? 'correct' : 'incorrect'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
          <div class="review-answer-key">Câu ${item.number}: Đáp án đúng: "${correctAnswers}"</div>
          <div style="font-size: 0.9rem; margin-top: 4px;">Câu trả lời của bạn: "${uAns}"</div>
          
          <div class="review-meta">
            <span>Skill Tag: <code>${review.skill_tag || 'N/A'}</code></span>
          </div>
          ${review.explanation ? `<div class="explanation-text"><strong>Giải thích:</strong> ${review.explanation}</div>` : ''}
          ${review.evidence ? `<div class="evidence-text"><strong>Minh chứng (Evidence):</strong> "${review.evidence}"</div>` : ''}
          ${review.pitfall ? `<div class="pitfall-text"><strong>Bẫy cần tránh (Pitfall):</strong> ${review.pitfall}</div>` : ''}
        `;
        resultsDiv.appendChild(card);
      });
    });
  });

  resultsDiv.scrollIntoView({ behavior: 'smooth' });
}
