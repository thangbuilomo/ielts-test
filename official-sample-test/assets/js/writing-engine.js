// IELTS Writing Engine - Saola Tests

let testData = null;
let timerInterval = null;
let secondsRemaining = 2400; // Task 2 default 40 minutes
let isSubmitted = false;
let minWordLimit = 250; // Task 2 default

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

// Disable right click globally in Writing
document.addEventListener('contextmenu', e => e.preventDefault());

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

// Load test data
async function loadTestData() {
  const urlParams = new URLSearchParams(window.location.search);
  const taskFile = urlParams.get('task');
  if (!taskFile) {
    alert("Không tìm thấy bài test!");
    window.location.href = "index.html";
    return;
  }

  try {
    const response = await fetch(`data/writing/${taskFile}`);
    testData = await response.json();
    
    // Set headers
    document.getElementById('startTestTitle').innerText = testData.title;
    document.getElementById('testTitleHeader').innerText = testData.title;
    
    secondsRemaining = testData.duration_seconds || 2400;
    
    // Set word limits based on test id
    if (testData.test_id.includes('task1')) {
      minWordLimit = 150;
      document.getElementById('minWordWarning').innerText = "Minimum 150 words";
    } else {
      minWordLimit = 250;
      document.getElementById('minWordWarning').innerText = "Minimum 250 words";
    }
    updateTimerDisplay();

    // Render Prompt
    renderPrompt();

    // Load draft from localstorage if it exists
    const savedDraft = localStorage.getItem(`saola_writing_autosave_${testData.test_id}`);
    if (savedDraft) {
      document.getElementById('writingEditor').value = savedDraft;
      updateWordCount();
    }

  } catch (error) {
    console.error("Lỗi khi tải dữ liệu bài test:", error);
    alert("Không thể tải dữ liệu bài test.");
  }
}

// Setup Event Listeners
function setupEventListeners() {
  document.getElementById('startTestBtn').addEventListener('click', () => {
    document.getElementById('startGate').style.display = 'none';
    startTimer();
    startAutosaveLoop();
  });

  const editor = document.getElementById('writingEditor');
  editor.addEventListener('input', updateWordCount);

  document.getElementById('submitBtn').addEventListener('click', () => {
    const wordCount = getWordCount();
    if (wordCount < minWordLimit) {
      if (!confirm(`Bài viết của bạn mới đạt ${wordCount} từ (dưới mức tối thiểu ${minWordLimit} từ). Bạn vẫn muốn nộp bài?`)) {
        return;
      }
    } else {
      if (!confirm("Bạn có chắc chắn muốn nộp bài viết này?")) {
        return;
      }
    }
    submitTest();
  });
}

// Timer
function startTimer() {
  timerInterval = setInterval(() => {
    secondsRemaining--;
    updateTimerDisplay();
    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      alert("Hết giờ làm bài! Tự động nộp bài viết.");
      submitTest();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  document.getElementById('timerDisplay').innerText = 
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Render Prompt
function renderPrompt() {
  const promptPanel = document.getElementById('writingPrompt');
  const part = testData.parts[0];

  let html = `
    <h2>${part.label}</h2>
    <p style="font-style: italic; color: var(--text-secondary);">${part.instruction}</p>
    <div>${part.prompt_html}</div>
  `;
  
  promptPanel.innerHTML = html;

  // Correct image source pathing to point local to data/writing/
  promptPanel.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http') && !src.startsWith('data')) {
      const filename = src.substring(src.lastIndexOf('/') + 1);
      img.setAttribute('src', `data/writing/${filename}`);
    }
  });
}

// Word count logic
function getWordCount() {
  const text = document.getElementById('writingEditor').value.trim();
  if (text.length === 0) return 0;
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function updateWordCount() {
  const count = getWordCount();
  document.getElementById('wordCountDisplay').innerText = `${count} word${count === 1 ? '' : 's'}`;
  
  const warning = document.getElementById('minWordWarning');
  if (count < minWordLimit) {
    warning.style.display = 'block';
    warning.innerText = `Minimum ${minWordLimit} words (${minWordLimit - count} remaining)`;
  } else {
    warning.style.display = 'none';
  }
}

// Autosave loop
function startAutosaveLoop() {
  setInterval(() => {
    if (isSubmitted) return;
    const text = document.getElementById('writingEditor').value;
    const statusSpan = document.getElementById('autosaveStatus');
    
    statusSpan.innerText = "Saving draft...";
    localStorage.setItem(`saola_writing_autosave_${testData.test_id}`, text);
    
    setTimeout(() => {
      statusSpan.innerText = "Draft autosaved locally.";
    }, 1000);
  }, 10000); // Save every 10 seconds
}

// Submit test
function submitTest() {
  isSubmitted = true;
  clearInterval(timerInterval);
  document.getElementById('submitBtn').style.display = 'none';
  
  const text = document.getElementById('writingEditor').value;
  
  // Show receipt screen
  document.getElementById('editorContainer').style.display = 'none';
  const resultsDiv = document.getElementById('resultsContainer');
  resultsDiv.style.display = 'block';
  document.getElementById('savedEssayText').innerText = text;

  // Clear autosave
  localStorage.removeItem(`saola_writing_autosave_${testData.test_id}`);
}
