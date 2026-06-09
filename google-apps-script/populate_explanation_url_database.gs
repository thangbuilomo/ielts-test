const EXPLANATION_DB_MANIFEST_URL = 'https://raw.githubusercontent.com/thangbuilomo/audio-ielts/main/vault-9/explanation_key_database.json';

function setupExplanationKeyDatabaseFromGithub() {
  const spreadsheet = getExplanationDbSpreadsheet_();
  const sheetName = getExplanationDbSheetName_();
  const headers = getExplanationDbHeaders_();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const manifest = fetchExplanationDbManifest_();
  const entries = Array.isArray(manifest.rows) ? manifest.rows : [];

  const rows = entries.map(function(entry) {
    return headers.map(function(header) {
      if (header === 'updated_at') return new Date();
      return entry[header] == null ? '' : entry[header];
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  for (let col = 1; col <= headers.length; col += 1) {
    sheet.autoResizeColumn(col);
  }

  Logger.log('Inserted ' + rows.length + ' rows into sheet ' + sheetName);
  return {
    ok: true,
    sheet_name: sheetName,
    row_count: rows.length,
    manifest_url: EXPLANATION_DB_MANIFEST_URL
  };
}

function fetchExplanationDbManifest_() {
  const response = UrlFetchApp.fetch(EXPLANATION_DB_MANIFEST_URL, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Unable to fetch explanation manifest (' + status + '): ' + EXPLANATION_DB_MANIFEST_URL);
  }
  return JSON.parse(response.getContentText('UTF-8'));
}

function getExplanationDbSpreadsheet_() {
  if (typeof CONFIG !== 'undefined' && CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No active spreadsheet. Bind this script to a Google Sheet or set CONFIG.SPREADSHEET_ID.');
  }
  return spreadsheet;
}

function getExplanationDbSheetName_() {
  if (typeof CONFIG !== 'undefined' && CONFIG.EXPLANATION_DB_SHEET) {
    return CONFIG.EXPLANATION_DB_SHEET;
  }
  return 'explanation_key_database';
}

function getExplanationDbHeaders_() {
  if (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG.EXPLANATION_DB_HEADERS)) {
    return CONFIG.EXPLANATION_DB_HEADERS;
  }
  return [
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
  ];
}
