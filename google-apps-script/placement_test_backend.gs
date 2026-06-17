function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Account Sheet
  let accountSheet = ss.getSheetByName("Account");
  if (!accountSheet) {
    accountSheet = ss.insertSheet("Account");
    accountSheet.appendRow(["Username", "Password", "Status"]);
    // Freeze header
    accountSheet.setFrozenRows(1);
    // Add 5 test accounts
    for (let i = 1; i <= 5; i++) {
      let username = `student_test0${i}`;
      let password = `123456`;
      accountSheet.appendRow([username, password, "Active"]);
    }
  }

  // 2. Setup Writing Results
  let writingSheet = ss.getSheetByName("Results Writing");
  if (!writingSheet) {
    writingSheet = ss.insertSheet("Results Writing");
    writingSheet.appendRow(["Timestamp", "Test ID", "Attempt ID", "Username", "Full Name", "Phone", "Email", "Task 1 Word Count", "Task 2 Word Count", "Task 1 Content", "Task 2 Content", "Violations", "Submit Reason"]);
    writingSheet.setFrozenRows(1);
  }

  // 3. Setup Reading Results
  let readingSheet = ss.getSheetByName("Results Reading");
  if (!readingSheet) {
    readingSheet = ss.insertSheet("Results Reading");
    readingSheet.appendRow(["Timestamp", "Test ID", "Attempt ID", "Username", "Full Name", "Phone", "Email", "Score", "Correct", "Total", "Responses JSON", "Violations", "Submit Reason"]);
    readingSheet.setFrozenRows(1);
  }

  // 4. Setup Listening Results
  let listeningSheet = ss.getSheetByName("Results Listening");
  if (!listeningSheet) {
    listeningSheet = ss.insertSheet("Results Listening");
    listeningSheet.appendRow(["Timestamp", "Test ID", "Attempt ID", "Username", "Full Name", "Phone", "Email", "Score", "Correct", "Total", "Responses JSON", "Violations", "Submit Reason"]);
    listeningSheet.setFrozenRows(1);
  }

  Logger.log("Database setup complete.");
}

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput("Missing parameters").setMimeType(ContentService.MimeType.TEXT);
  }

  const action = e.parameter.action;
  const callback = e.parameter.callback;

  if (action === 'auth_student') {
    const username = (e.parameter.email || e.parameter.username || "").toLowerCase().trim();
    const password = e.parameter.password || "";
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const accountSheet = ss.getSheetByName("Account");
    if (!accountSheet) {
      return jsonpResponse({ ok: false, message: "Server error: Account sheet not found." }, callback);
    }
    
    const data = accountSheet.getDataRange().getValues();
    let found = false;
    let authResult = { ok: false, message: "Sai tài khoản hoặc mật khẩu." };
    
    // Row 0 is header
    for (let i = 1; i < data.length; i++) {
      let rowUsername = String(data[i][0]).toLowerCase().trim();
      let rowPassword = String(data[i][1]);
      let status = String(data[i][2]);
      
      if (rowUsername === username) {
        found = true;
        if (rowPassword === password) {
          if (status.toLowerCase() !== "active" && status.trim() !== "") {
            authResult = { ok: false, message: "Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt." };
          } else {
            authResult = {
              ok: true,
              username: rowUsername,
              auth_token: generateToken()
            };
          }
        }
        break;
      }
    }
    
    return jsonpResponse(authResult, callback);
  }

  return ContentService.createTextOutput("Invalid action").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const type = postData.type || "unknown";
    const timestamp = new Date();
    const testId = postData.test_id || postData.test_code || "";
    const attemptId = postData.attempt_id || "";
    const username = postData.username || postData.email || ""; // Frontend uses email param as username sometimes
    const fullName = postData.student_name || postData.full_name || "";
    const phone = postData.phone || "";
    const email = postData.real_email || ""; // Because 'email' is used for username in older code
    const violations = postData.violation_count || 0;
    const submitReason = postData.submit_reason_label || postData.submit_reason || "";

    if (type === 'writing_submit') {
      const sheet = ss.getSheetByName("Results Writing");
      if (sheet) {
        sheet.appendRow([
          timestamp, testId, attemptId, username, fullName, phone, email,
          postData.task1_word_count || 0,
          postData.task2_word_count || 0,
          postData.task1_text || "",
          postData.task2_text || "",
          violations,
          submitReason
        ]);
      }
    } else if (type === 'reading_submit') {
      const sheet = ss.getSheetByName("Results Reading");
      if (sheet) {
        sheet.appendRow([
          timestamp, testId, attemptId, username, fullName, phone, email,
          postData.score || 0,
          postData.correct_answers || 0,
          postData.total_questions || 0,
          JSON.stringify(postData.responses || {}),
          violations,
          submitReason
        ]);
      }
    } else if (type === 'listening_submit') {
      const sheet = ss.getSheetByName("Results Listening");
      if (sheet) {
        sheet.appendRow([
          timestamp, testId, attemptId, username, fullName, phone, email,
          postData.score || 0,
          postData.correct_answers || 0,
          postData.total_questions || 0,
          JSON.stringify(postData.responses || {}),
          violations,
          submitReason
        ]);
      }
    } else if (type === 'event') {
      // Ignore anti-cheat logging events to save quota, or log to a different sheet
      return ContentService.createTextOutput(JSON.stringify({ok: true, note: "Event ignored"})).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ok: true})).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: error.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function jsonpResponse(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function generateToken() {
  return Utilities.getUuid();
}
