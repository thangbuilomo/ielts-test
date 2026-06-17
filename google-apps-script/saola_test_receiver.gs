const CONFIG = {
  VERSION: '2026-06-09-url-backed-explanation-db',
  // Neu script khong gan truc tiep voi Google Sheet, dien ID sheet vao day.
  SPREADSHEET_ID: '',
  DEBUG_KEY: 'saola_debug_2026',
  AUTH_TOKEN_SECRET: 'saola_writing_mock_test_token_2026_change_later',
  GLOBAL_AUTH_TEST_ID: 'saola_global_login',
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  WRITING_ANSWER_SHEET: 'Writing_Answer',
  READING_ANSWER_SHEET: 'mock_reading_attempts',
  LISTENING_ANSWER_SHEET: 'mock_listening_attempts',
  CHEAT_SHEET: 'Cheat_Record',
  STUDENT_SHEET: 'Student_List',
  EXPLANATION_DB_SHEET: 'explanation_key_database',
  JSON_FETCH_CACHE_SECONDS: 21600,
  EXPLANATION_DB_HEADERS: [
    'test_id',
    'canonical_test_id',
    'vault',
    'module',
    'skill',
    'test_number',
    'question_count',
    'answer_key_url',
    'annotated_url',
    'explanations_url',
    'notes',
    'updated_at'
  ],
  
  WRITING_HEADERS: ['Email học viên', 'Họ và tên', 'Task 1', 'Task 2', 'Mã đề', 'Lý do nộp bài', 'Attempt ID'],
  READING_LISTENING_HEADERS: [
    'Attempt ID', 
    'Email học viên', 
    'Họ và tên',
    'Mã bài test', 
    'Thời gian nộp', 
    'Điểm số', 
    'Band', 
    'Số lần vi phạm', 
    'Answers JSON'
  ],
  CHEAT_HEADERS: [
    'Email học viên',
    'Họ và tên',
    'Loại cheat',
    'Ngày vi phạm',
    'Giờ vi phạm',
    'Mã bài test',
    'Attempt ID',
    'Số giây từ lúc bắt đầu',
    'Tổng số vi phạm',
    'Chi tiết',
    'User agent',
    'Screen size',
    'Event ID'
  ]
};

const CHEAT_EVENT_TYPES = {
  FULLSCREEN_EXIT: true,
  TAB_SWITCH: true,
  WINDOW_BLUR: true,
  PASTE_BLOCKED: true,
  COPY_BLOCKED: true,
  CUT_BLOCKED: true,
  RIGHT_CLICK_BLOCKED: true,
  PAGE_UNLOAD: true,
  AUTO_SUBMIT_VIOLATION: true
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};

  if (params.action === 'auth_student') {
    return authStudentResponse_(params);
  }

  if (params.action === 'health') {
    return maybeJsonpResponse_(params.callback, getHealth_());
  }

  if (params.action === 'auth_debug') {
    return authDebugResponse_(params);
  }

  return maybeJsonpResponse_(params.callback, {
    ok: true,
    app: 'Saola Test Receiver (Writing, Reading, Listening)',
    version: CONFIG.VERSION
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const result = handlePayload_(payload);
    return jsonResponse_({
      ok: true,
      received_type: payload.type || '',
      result
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function authStudentResponse_(params) {
  try {
    const email = normalizeEmail_(params.email);
    const passwordHash = normalizeHash_(params.password_hash);
    const legacyPassword = clean_(params.password).trim();
    const testId = clean_(params.test_id).trim();
    const clientIp = clean_(params.client_ip).trim(); // Frontend can pass this if available

    const result = authenticateStudent_(email, passwordHash, legacyPassword, testId, clientIp);
    result.hash_supported = true;
    return maybeJsonpResponse_(params.callback, result);
  } catch (err) {
    return maybeJsonpResponse_(params.callback, {
      ok: false,
      hash_supported: true,
      message: 'Vui lòng kiểm tra lại thông tin hoặc liên hệ giáo viên để nhận tài khoản và mật khẩu.'
    });
  }
}

function authenticateStudent_(email, passwordHash, legacyPassword, testId, clientIp) {
  const fail = {
    ok: false,
    message: 'Vui lòng kiểm tra lại thông tin hoặc liên hệ giáo viên để nhận tài khoản và mật khẩu.'
  };

  if (!email || (!passwordHash && !legacyPassword)) return fail;

  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.STUDENT_SHEET);
  if (!sheet) return fail;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return fail;

  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(8, sheet.getLastColumn())).getValues();
  for (let i = 0; i < values.length; i += 1) {
    const row = values[i];
    const studentName = clean_(row[0]).trim();
    const rowEmail = normalizeEmail_(row[1]);
    const status = normalizeStatus_(row[5]);
    const rowPassword = clean_(row[6]).trim();
    const rowPasswordHash = storedPasswordHash_(rowPassword);
    
    const passwordMatches = passwordHash
      ? rowPasswordHash === passwordHash || normalizeHash_(rowPassword) === passwordHash
      : rowPassword === clean_(legacyPassword).trim();

    if (rowEmail === email && passwordMatches && isActiveStatus_(status)) {
      // Update Column H (Index 7) with IP if provided
      if (clientIp) {
        let existingIp = String(row[7] || '').trim();
        if (!existingIp.includes(clientIp)) {
          let newIp = existingIp ? existingIp + ', ' + clientIp : clientIp;
          sheet.getRange(i + 2, 8).setValue(newIp);
        }
      }

      return {
        ok: true,
        email: rowEmail,
        student_name: studentName || rowEmail,
        auth_token: createAuthToken_(rowEmail, testId || 'mock_test_default')
      };
    }
  }

  return fail;
}

function handlePayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  if (payload.type === 'reading_submit' || payload.type === 'listening_submit') {
    const isAuth = checkAuth_(payload); // returns boolean
    appendMockAnswer_(payload);
    appendFinalPayloadCheatEvents_(payload);
    
    // Fetch explanation data
    const skill = payload.type === 'reading_submit' ? 'Reading' : 'Listening';
    const explanationData = getExplanationData_(payload.test_id, skill, isAuth);
    
    return {
      status: 'saved',
      feedback: explanationData
    };
  }

  if (payload.guest_mode) {
    return 'guest_payload_ignored';
  }

  if (payload.type === 'writing_submit') {
    validateAuthenticatedPayload_(payload);
    appendWritingAnswer_(payload);
    appendFinalPayloadCheatEvents_(payload);
    return 'writing_answer_saved';
  }

  if (payload.type === 'event') {
    validateAuthenticatedPayload_(payload);
    if (isCheatEvent_(payload.event_type)) {
      appendCheatRecord_(payload);
      return 'cheat_event_saved';
    }
    return 'event_ignored';
  }

  return 'unknown_payload_ignored';
}

function checkAuth_(payload) {
  if (payload.guest_mode) return false;
  try {
    validateAuthenticatedPayload_(payload);
    return true;
  } catch (e) {
    return false;
  }
}

function getExplanationData_(testId, skill, isAuthenticated) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.EXPLANATION_DB_SHEET);
  if (!sheet) return {};

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  const values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = values[0].map(function(header) {
    return String(header || '').trim();
  });
  const headerIndex = buildHeaderIndex_(headers);
  const normalizedTestId = normalizeTestIdForDb_(testId);
  const normalizedSkill = clean_(skill).trim().toLowerCase();

  for (let i = 0; i < values.length; i++) {
    if (i === 0) continue;

    const row = values[i];
    const rowTestId = valueByHeader_(row, headerIndex, 'test_id');
    const rowCanonicalId = valueByHeader_(row, headerIndex, 'canonical_test_id');
    const rowSkill = valueByHeader_(row, headerIndex, 'skill');
    const rowModule = valueByHeader_(row, headerIndex, 'module');

    const testMatches = normalizeTestIdForDb_(rowTestId) === normalizedTestId
      || normalizeTestIdForDb_(rowCanonicalId) === normalizedTestId;
    const skillMatches = !normalizedSkill
      || String(rowSkill || '').trim().toLowerCase() === normalizedSkill
      || String(rowModule || '').trim().toLowerCase() === normalizedSkill;

    if (testMatches && skillMatches) {
      const answerKeyRef = valueByHeader_(row, headerIndex, 'answer_key_url') || valueByHeader_(row, headerIndex, 'json_key');
      const annotatedRef = valueByHeader_(row, headerIndex, 'annotated_url') || valueByHeader_(row, headerIndex, 'highlight_json');
      const explanationsRef = valueByHeader_(row, headerIndex, 'explanations_url') || valueByHeader_(row, headerIndex, 'explanation_json');

      const result = {
        json_key: parseJsonReference_(answerKeyRef),
        highlight_json: parseJsonReference_(annotatedRef)
      };

      if (isAuthenticated) {
        result.explanation_json = parseJsonReference_(explanationsRef);
      }
      return result;
    }
  }
  return {};
}

function buildHeaderIndex_(headers) {
  const result = {};
  headers.forEach(function(header, index) {
    if (header) result[header] = index;
  });
  return result;
}

function valueByHeader_(row, headerIndex, headerName) {
  if (!Object.prototype.hasOwnProperty.call(headerIndex, headerName)) return '';
  return row[headerIndex[headerName]];
}

function normalizeTestIdForDb_(value) {
  return clean_(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function parseJsonReference_(ref) {
  try {
    const value = clean_(ref).trim();
    if (!value) return null;

    let content = value;
    if (value.indexOf('DRIVE_ID:') === 0) {
      const fileId = value.replace('DRIVE_ID:', '').trim();
      content = DriveApp.getFileById(fileId).getBlob().getDataAsString();
    } else if (/^https?:\/\//i.test(value)) {
      content = fetchJsonTextFromUrl_(value);
    }
    return JSON.parse(content);
  } catch(e) {
    return null;
  }
}

function fetchJsonTextFromUrl_(url) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'json_url_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, url)
  ).slice(0, 80);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Unable to fetch JSON URL ' + url + ' (' + status + ')');
  }

  const content = response.getContentText('UTF-8');
  cache.put(cacheKey, content, CONFIG.JSON_FETCH_CACHE_SECONDS);
  return content;
}

function appendMockAnswer_(payload) {
  const sheetName = payload.type === 'reading_submit' ? CONFIG.READING_ANSWER_SHEET : CONFIG.LISTENING_ANSWER_SHEET;
  const sheet = getOrCreateSheet_(sheetName, CONFIG.READING_LISTENING_HEADERS);
  const attemptId = clean_(payload.attempt_id);
  
  if (attemptId && mockAttemptAlreadyExists_(sheet, attemptId)) {
    return;
  }

  const eventDate = payload.submitted_at ? new Date(payload.submitted_at) : new Date();
  const dateText = Utilities.formatDate(eventDate, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    attemptId,
    clean_(payload.email || 'GUEST'),
    clean_(payload.student_name || 'GUEST'),
    clean_(payload.test_id),
    dateText,
    payload.score || 0,
    payload.band || 0,
    payload.violation_count || 0,
    stringify_(payload.answers_json || {})
  ]);
}

function appendWritingAnswer_(payload) {
  const sheet = getOrCreateSheet_(CONFIG.WRITING_ANSWER_SHEET, CONFIG.WRITING_HEADERS);
  const attemptId = clean_(payload.attempt_id);
  if (attemptId && writingAttemptAlreadyExists_(sheet, attemptId)) {
    return;
  }

  sheet.appendRow([
    clean_(payload.email),
    clean_(payload.student_name),
    clean_(payload.task1_text),
    clean_(payload.task2_text),
    clean_(payload.test_code || payload.test_id),
    clean_(payload.submit_reason_label || payload.submit_reason),
    attemptId
  ]);
}

function mockAttemptAlreadyExists_(sheet, attemptId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  return values.some(row => String(row[0]) === attemptId);
}

function writingAttemptAlreadyExists_(sheet, attemptId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const attemptColumn = CONFIG.WRITING_HEADERS.indexOf('Attempt ID') + 1;
  if (attemptColumn < 1) return false;
  const values = sheet.getRange(2, attemptColumn, lastRow - 1, 1).getValues();
  return values.some(row => String(row[0]) === attemptId);
}

function appendFinalPayloadCheatEvents_(payload) {
  const events = Array.isArray(payload.anti_cheat_events) ? payload.anti_cheat_events : [];
  events.forEach(event => {
    if (!event || !isCheatEvent_(event.event_type)) return;
    appendCheatRecord_({
      ...event,
      email: event.email || payload.email,
      student_name: event.student_name || payload.student_name,
      test_id: event.test_id || payload.test_id,
      attempt_id: event.attempt_id || payload.attempt_id,
      user_agent: event.user_agent || payload.user_agent,
      screen_size: event.screen_size || payload.screen_size
    });
  });
}

function appendCheatRecord_(payload) {
  const sheet = getOrCreateSheet_(CONFIG.CHEAT_SHEET, CONFIG.CHEAT_HEADERS);
  const eventId = clean_(payload.event_id);

  if (eventId && cheatEventAlreadyExists_(sheet, eventId)) {
    return;
  }

  const eventDate = payload.event_time ? new Date(payload.event_time) : new Date();
  const dateText = Utilities.formatDate(eventDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const timeText = Utilities.formatDate(eventDate, CONFIG.TIMEZONE, 'HH:mm:ss');

  sheet.appendRow([
    clean_(payload.email),
    clean_(payload.student_name),
    clean_(payload.event_type),
    dateText,
    timeText,
    clean_(payload.test_id),
    clean_(payload.attempt_id),
    payload.elapsed_seconds || 0,
    payload.violation_count || 0,
    stringify_(payload.payload || {}),
    clean_(payload.user_agent),
    clean_(payload.screen_size),
    eventId
  ]);
}

function cheatEventAlreadyExists_(sheet, eventId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const eventIdColumn = CONFIG.CHEAT_HEADERS.indexOf('Event ID') + 1;
  const values = sheet.getRange(2, eventIdColumn, lastRow - 1, 1).getValues();
  return values.some(row => String(row[0]) === eventId);
}

function parsePayload_(e) {
  if (!e) throw new Error('Missing request event');
  const rawBody = e.postData && e.postData.contents ? e.postData.contents : '';
  if (rawBody) {
    try {
      return JSON.parse(rawBody);
    } catch (err) {
      throw new Error('Request body is not valid JSON');
    }
  }
  if (e.parameter && e.parameter.payload) {
    try {
      return JSON.parse(e.parameter.payload);
    } catch (err) {
      throw new Error('parameter.payload is not valid JSON');
    }
  }
  if (e.parameter && Object.keys(e.parameter).length) {
    return e.parameter;
  }
  throw new Error('Empty request body');
}

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No active spreadsheet. Set CONFIG.SPREADSHEET_ID or bind this script to a Google Sheet.');
  }
  return spreadsheet;
}

function getOrCreateSheet_(sheetName, headers) {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  headers.forEach((header, index) => {
    const currentHeader = String(current[index] || '').trim();
    if (!currentHeader) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
}

function validateAuthenticatedPayload_(payload) {
  const email = normalizeEmail_(payload.email);
  const testId = clean_(payload.test_id).trim();
  const token = clean_(payload.auth_token).trim();

  if (!email || !testId || !token || !verifyAuthToken_(token, email, testId)) {
    throw new Error('Invalid auth token');
  }
}

function createAuthToken_(email, testId) {
  const expiresAt = Date.now() + (4 * 60 * 60 * 1000);
  const data = {
    email: normalizeEmail_(email),
    test_id: clean_(testId).trim(),
    exp: expiresAt
  };
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify(data));
  const signature = signTokenPayload_(payload);
  return `${payload}.${signature}`;
}

function verifyAuthToken_(token, email, testId) {
  const parts = clean_(token).split('.');
  if (parts.length !== 2) return false;
  const payload = parts[0];
  const signature = parts[1];
  if (signature !== signTokenPayload_(payload)) return false;
  try {
    const data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString());
    if (normalizeEmail_(data.email) !== normalizeEmail_(email)) return false;
    const tokenTestId = clean_(data.test_id).trim();
    const requestedTestId = clean_(testId).trim();
    if (tokenTestId !== requestedTestId && tokenTestId !== CONFIG.GLOBAL_AUTH_TEST_ID) return false;
    return Number(data.exp) > Date.now();
  } catch (err) {
    return false;
  }
}

function signTokenPayload_(payload) {
  const bytes = Utilities.computeHmacSha256Signature(payload, CONFIG.AUTH_TOKEN_SECRET);
  return Utilities.base64EncodeWebSafe(bytes);
}

function isCheatEvent_(eventType) {
  return !!CHEAT_EVENT_TYPES[String(eventType || '')];
}

function clean_(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .normalize('NFKC');
}

function normalizeEmail_(value) {
  return clean_(value).trim().toLowerCase();
}

function normalizeHash_(value) {
  return clean_(value).trim().toLowerCase().replace(/^sha256:/, '');
}

function normalizeText_(value) {
  return clean_(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeStatus_(value) {
  return normalizeText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isActiveStatus_(normalizedStatus) {
  return normalizedStatus === 'dang hoc' || normalizedStatus.includes('dang hoc');
}

function storedPasswordHash_(value) {
  const stored = clean_(value).trim();
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    return normalizeHash_(stored);
  }
  if (/^sha256:[a-f0-9]{64}$/i.test(stored)) {
    return normalizeHash_(stored);
  }
  return sha256Hex_(stored);
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return bytes.map(byte => {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return (`0${unsigned.toString(16)}`).slice(-2);
  }).join('');
}

function stringify_(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function maybeJsonpResponse_(callback, data) {
  if (!callback) return jsonResponse_(data);
  const safeCallback = clean_(callback).trim();
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(safeCallback)) {
    return jsonResponse_({ ok: false, error: 'Invalid callback' });
  }
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(data)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getHealth_() { return { ok: true, version: CONFIG.VERSION }; }
function authDebugResponse_(params) { return { ok: true, debug: 'auth logic active' }; }
