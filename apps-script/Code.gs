// StudyBase Apps Script (paste into the script.google.com project bound to SYNC_URL).
// After editing, Deploy -> Manage deployments -> Edit -> New version.
//
// PDF/image topic uploads use _up_ / _ur_ keys. handleImageUpload accepts
// data:image/* and data:application/pdf and returns a Drive URL.

const SHEET_NAME = 'studybase';
const CHUNK_SIZE = 48000;

// ── Read a row, stitching together any chunks across columns ──
function readRow(sheet, key) {
  if (!sheet || !sheet.getLastRow()) return null;
  const rows = sheet.getDataRange().getValues();
  for (const row of rows) {
    if (row[0] !== key) continue;
    let combined = '';
    for (let i = 1; i < row.length; i++) {
      if (row[i] instanceof Date || row[i] === '') break;
      if (typeof row[i] === 'string') combined += row[i];
    }
    try { return JSON.parse(combined || 'null'); } catch (e) { return null; }
  }
  return null;
}

// ── Write a row, splitting across columns if data is large ──
function storeRow(key, dataStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  const chunks = [];
  for (let i = 0; i < dataStr.length; i += CHUNK_SIZE) {
    chunks.push(dataStr.slice(i, i + CHUNK_SIZE));
  }
  const rowData = [key].concat(chunks, [new Date()]);

  if (sheet.getLastRow() > 0) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === key) {
        const clearWidth = Math.max(rows[i].length, rowData.length);
        sheet.getRange(i + 1, 1, 1, clearWidth).clearContent();
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return;
      }
    }
  }
  sheet.appendRow(rowData);
}

function doGet(e) {
  const key = e.parameter.key;
  const callback = e.parameter.callback;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const result = readRow(sheet, key);
  const json = JSON.stringify({ data: result });
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const gh = JSON.parse(e.postData.contents);
    if (gh.action && gh.issue) return handleGitHubWebhook(gh);
  } catch (err) {}

  let key, dataStr;
  try {
    const body = JSON.parse(e.postData.contents);
    key = body.key;
    dataStr = body.data;
  } catch (err) {
    const params = e.postData.contents.split('&');
    const p = {};
    params.forEach(function (x) {
      const i = x.indexOf('=');
      if (i > -1) {
        p[decodeURIComponent(x.slice(0, i).replace(/\+/g, ' '))] =
          decodeURIComponent(x.slice(i + 1).replace(/\+/g, ' '));
      }
    });
    key = p.key;
    dataStr = p.data;
  }

  if (key && key.startsWith('_up_')) return handleImageUpload(key, dataStr);

  if (key === 'studybase_suggestions') {
    const existing = getExisting(key);
    const incoming = JSON.parse(dataStr || '[]');
    incoming.forEach(function (s) {
      if (!existing.find(function (ex) { return ex.id === s.id; })) createGitHubIssue(s);
    });
  }

  storeRow(key, dataStr);
  return out({ ok: true });
}

function getExisting(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const result = readRow(sheet, key);
  return result || [];
}

function handleGitHubWebhook(payload) {
  const issue = payload.issue;
  const action = payload.action;
  const match = issue.body && issue.body.match(/\*\*ID:\*\* `([^`]+)`/);

  if (action === 'opened' && !match) {
    const tagMap = { bug: 'bug', enhancement: 'request', idea: 'idea' };
    const label = issue.labels && issue.labels[0] ? issue.labels[0].name : '';
    const tag = tagMap[label] || 'idea';
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);
    const newSug = {
      id: 'gh-' + issue.number,
      text: issue.title + (issue.body ? '\n\n' + issue.body : ''),
      tag: tag,
      date: date,
      time: time,
      githubStatus: 'open',
      githubUrl: issue.html_url,
      githubNumber: issue.number
    };
    const existing = getExisting('studybase_suggestions');
    existing.push(newSug);
    storeRow('studybase_suggestions', JSON.stringify(existing));
    return out({ ok: true });
  }

  if (!match) return out({ ok: true });
  const suggestionId = match[1];
  const existing = getExisting('studybase_suggestions');

  if (action === 'closed' || action === 'deleted') {
    storeRow('studybase_suggestions', JSON.stringify(existing.filter(function (s) {
      return s.id !== suggestionId;
    })));
    return out({ ok: true });
  }

  if (action === 'reopened' || action === 'edited' || action === 'opened') {
    let found = false;
    const updated = existing.map(function (s) {
      if (s.id !== suggestionId) return s;
      found = true;
      return Object.assign({}, s, {
        githubStatus: 'open',
        githubUrl: issue.html_url,
        githubNumber: issue.number
      });
    });
    if (!found) {
      updated.push({
        id: suggestionId,
        text: issue.title,
        tag: issue.labels && issue.labels[0] ? issue.labels[0].name : '',
        date: new Date().toISOString().slice(0, 10),
        githubStatus: 'open',
        githubUrl: issue.html_url,
        githubNumber: issue.number
      });
    }
    storeRow('studybase_suggestions', JSON.stringify(updated));
    return out({ ok: true });
  }

  return out({ ok: true });
}

function createGitHubIssue(suggestion) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) return;
  const tagEmoji = { bug: '🐛', request: '✨', idea: '💡' };
  const emoji = tagEmoji[suggestion.tag] || '📝';
  const payload = {
    title: emoji + ' ' + suggestion.text.substring(0, 72),
    body: [
      suggestion.text,
      '',
      '---',
      '_Submitted via StudyBase on ' + suggestion.date + (suggestion.time ? ' at ' + suggestion.time : '') + '_',
      '',
      '**ID:** `' + suggestion.id + '`'
    ].join('\n'),
    labels: [suggestion.tag || 'suggestion']
  };
  try {
    UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/issues', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('GitHub issue creation failed: ' + e.toString());
  }
}

function syncGitHubIssuesToSuggestions() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) return;
  const response = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + repo + '/issues?state=all&per_page=100',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    }
  );
  if (response.getResponseCode() !== 200) return;
  const issues = JSON.parse(response.getContentText());
  const existing = getExisting('studybase_suggestions');
  const updated = existing.map(function (s) {
    const issue = issues.find(function (i) {
      return i.body && i.body.indexOf('`' + s.id + '`') > -1;
    });
    if (!issue) return s;
    return Object.assign({}, s, {
      githubStatus: issue.state,
      githubUrl: issue.html_url,
      githubNumber: issue.number
    });
  });
  storeRow('studybase_suggestions', JSON.stringify(updated));
  Logger.log('Synced ' + updated.length + ' suggestions');
}

function handleImageUpload(uploadKey, dataStr) {
  const resultKey = '_ur_' + uploadKey.slice(4);
  try {
    const payload = JSON.parse(dataStr);
    const base64DataUrl = payload.image;
    const filename = payload.filename || ('file_' + Date.now());
    const match = base64DataUrl.match(/^data:(image\/[\w.+-]+|application\/pdf);base64,(.+)$/);
    if (!match) {
      storeRow(resultKey, JSON.stringify({ ok: false, error: 'bad_format' }));
      return out({ ok: false });
    }
    const mimeType = match[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), mimeType, filename);
    const folders = DriveApp.getFoldersByName('StudyBase Images');
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('StudyBase Images');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(filename);
    const fileId = file.getId();
    const url = isPdf
      ? ('https://drive.google.com/file/d/' + fileId + '/preview')
      : ('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000');
    storeRow(resultKey, JSON.stringify({ ok: true, url: url, id: fileId }));
    return out({ ok: true });
  } catch (e) {
    storeRow(resultKey, JSON.stringify({ ok: false, error: e.toString() }));
    return out({ ok: false, error: e.toString() });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authDrive() {
  const folder = DriveApp.createFolder('StudyBase Images');
  folder.setTrashed(true);
}

function testGitHub() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  Logger.log('token: ' + token);
  Logger.log('repo: ' + repo);
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ title: 'Test issue from Apps Script', body: 'Testing connection.' }),
    muteHttpExceptions: true
  });
  Logger.log('status: ' + response.getResponseCode());
  Logger.log('body: ' + response.getContentText());
}
