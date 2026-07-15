const DUYURU_DOSYA_ID = '19ftKmNyx-bbawy1QJumgQ5qbTTj9F_OHwMTZ-T9k5QY';
const DUYURU_SEKMESI = 'Duyurular';
const CEVAP_SEKMESI = 'Cevaplar';

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const data = params.action === 'voteAnnouncement'
      ? saveVote_({announcementId:params.announcementId, answer:params.answer, deviceId:params.deviceId})
      : readAnnouncements_();
    return jsonResponse_({ok:true, data:data}, params.callback);
  } catch (error) {
    return jsonResponse_({ok:false, error:error.message || String(error)}, e && e.parameter && e.parameter.callback);
  }
}

function doPost(e) {
  try {
    const request = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    let data;
    if (request.action === 'listAnnouncements') data = readAnnouncements_();
    else if (request.action === 'voteAnnouncement') data = saveVote_(request.data || {});
    else throw new Error('Geçersiz işlem.');
    return jsonResponse_({ok:true, data:data});
  } catch (error) {
    return jsonResponse_({ok:false, error:error.message || String(error)});
  }
}

function readAnnouncements_() {
  const ss = SpreadsheetApp.openById(DUYURU_DOSYA_ID);
  const sheet = ss.getSheetByName(DUYURU_SEKMESI);
  const responses = ensureResponsesSheet_(ss);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const totals = {};
  if (responses.getLastRow() > 1) {
    responses.getRange(2, 1, responses.getLastRow() - 1, 6).getValues().forEach(row => {
      const id = String(row[1] || '');
      if (!totals[id]) totals[id] = {yes:0, no:0};
      if (normalizeAnswer_(row[2]) === 'Evet') totals[id].yes++;
      if (normalizeAnswer_(row[2]) === 'Hayır') totals[id].no++;
    });
  }

  const timezone = 'Europe/Istanbul';
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(8, sheet.getLastColumn())).getValues()
    .filter(row => row[0] && isActive_(row[5]))
    .map(row => {
      const id = String(row[0]);
      const count = totals[id] || {yes:Number(row[6] || 0), no:Number(row[7] || 0)};
      return {
        id:id,
        title:String(row[1] || ''),
        description:String(row[2] || ''),
        publishDate:formatDate_(row[3], timezone),
        endDate:formatDate_(row[4], timezone),
        active:true,
        yes:count.yes,
        no:count.no
      };
    });
}

function saveVote_(data) {
  const answer = normalizeAnswer_(data.answer);
  if (!data.announcementId || !answer || !data.deviceId) throw new Error('Geçersiz anket yanıtı.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(DUYURU_DOSYA_ID);
    const announcements = ss.getSheetByName(DUYURU_SEKMESI);
    const responses = ensureResponsesSheet_(ss);
    if (!announcements || announcements.getLastRow() < 2) throw new Error('Duyuru sekmesi bulunamadı.');

    const rows = announcements.getRange(2, 1, announcements.getLastRow() - 1, Math.min(8, announcements.getLastColumn())).getValues();
    const rowIndex = rows.findIndex(row => String(row[0]) === String(data.announcementId));
    if (rowIndex < 0 || !isActive_(rows[rowIndex][5])) throw new Error('Duyuru aktif değil.');
    const deadline = rows[rowIndex][4];
    if (deadline instanceof Date && deadline < new Date()) throw new Error('Bu anketin cevap süresi doldu.');

    const existing = responses.getLastRow() > 1 ? responses.getRange(2, 1, responses.getLastRow() - 1, 6).getValues() : [];
    if (existing.some(row => String(row[1]) === String(data.announcementId) && String(row[3]) === String(data.deviceId))) {
      throw new Error('Bu cihazdan daha önce yanıt verilmiş.');
    }

    responses.appendRow([Utilities.getUuid(), String(data.announcementId), answer, String(data.deviceId), new Date(), 'Geçerli']);
    const yes = existing.filter(row => String(row[1]) === String(data.announcementId) && normalizeAnswer_(row[2]) === 'Evet').length + (answer === 'Evet' ? 1 : 0);
    const no = existing.filter(row => String(row[1]) === String(data.announcementId) && normalizeAnswer_(row[2]) === 'Hayır').length + (answer === 'Hayır' ? 1 : 0);
    if (announcements.getLastColumn() >= 8) announcements.getRange(rowIndex + 2, 7, 1, 2).setValues([[yes, no]]);
    return {announcementId:String(data.announcementId), answer:answer, yes:yes, no:no};
  } finally {
    lock.releaseLock();
  }
}

function ensureResponsesSheet_(ss) {
  let sheet = ss.getSheetByName(CEVAP_SEKMESI);
  if (!sheet) sheet = ss.insertSheet(CEVAP_SEKMESI);
  if (sheet.getLastRow() === 0) sheet.appendRow(['Cevap ID', 'Duyuru ID', 'Cevap', 'Cihaz ID', 'Tarih', 'Durum']);
  return sheet;
}

function isActive_(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value || '').trim().toLocaleLowerCase('tr-TR');
  return ['true', 'evet', 'aktif', '1', 'x'].indexOf(normalized) > -1;
}

function normalizeAnswer_(value) {
  const normalized = String(value || '').trim().toLocaleLowerCase('tr-TR');
  if (normalized === 'evet') return 'Evet';
  if (normalized === 'hayır' || normalized === 'hayir') return 'Hayır';
  return '';
}

function formatDate_(value, timezone) {
  if (!value) return '';
  return value instanceof Date ? Utilities.formatDate(value, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX") : String(value);
}

function jsonResponse_(payload, callback) {
  const safeCallback = /^[A-Za-z_$][\w$\.]*$/.test(String(callback || '')) ? String(callback) : '';
  return ContentService.createTextOutput(safeCallback ? safeCallback + '(' + JSON.stringify(payload) + ');' : JSON.stringify(payload))
    .setMimeType(safeCallback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
