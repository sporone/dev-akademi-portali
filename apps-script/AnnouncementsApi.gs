const DUYURU_DOSYA_ID = '19ftKmNyx-bbawy1QJumgQ5qbTTj9F_OHwMTZ-T9k5QY';
const DUYURU_SEKMESI = 'Duyurular';
const CEVAP_SEKMESI = 'Cevaplar';
const URUN_DOSYA_ID = '1gCq9HHdaak1S5s6Pqq8ypctFzidP5wqCW8K-8RpQcrg';
const URUN_SEKMESI = 'Ürünler';
const REZERVASYON_SEKMESI = 'Rezervasyonlar';
const KATEGORI_SEKMESI = 'Kategoriler';

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    let data;
    if (params.action === 'voteAnnouncement') data = saveVote_({announcementId:params.announcementId, answer:params.answer, deviceId:params.deviceId});
    else if (params.action === 'listProducts') data = readProducts_();
    else if (params.action === 'listProductCategories') data = readProductCategories_();
    else if (params.action === 'reserveProduct') data = saveProductReservation_(params);
    else data = readAnnouncements_();
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

function readProducts_() {
  SpreadsheetApp.flush();
  const sheet = SpreadsheetApp.openById(URUN_DOSYA_ID).getSheetByName(URUN_SEKMESI);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues().filter(row => row[0] && isActive_(row[14])).map(row => ({
    id:String(row[0]), name:String(row[1] || ''), category:String(row[2] || ''), description:String(row[3] || ''),
    price:Number(row[4] || 0), image:driveImageUrl_(row[5]), sizes:String(row[6] || '').split(',').map(x => x.trim()).filter(Boolean),
    stockSalon1:Number(row[11] || 0), stockSalon2:Number(row[12] || 0), stock:Number(row[13] || 0), active:true
  }));
}

function readProductCategories_() {
  const sheet = SpreadsheetApp.openById(URUN_DOSYA_ID).getSheetByName(KATEGORI_SEKMESI);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    .filter(row => row[0] && isActive_(row[1]))
    .sort((a, b) => Number(a[2] || 999) - Number(b[2] || 999))
    .map(row => String(row[0]).trim());
}

function driveImageUrl_(value) {
  const url = String(value || '');
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w1200' : url;
}

function saveProductReservation_(data) {
  const required = ['productId','productName','fullName','team','size','quantity','deliveryPoint','deliveryDate'];
  required.forEach(key => { if (!String(data[key] || '').trim()) throw new Error('Eksik rezervasyon bilgisi: ' + key); });
  const quantity = Math.max(1, Math.min(10, Number(data.quantity || 1)));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(URUN_DOSYA_ID), products = ss.getSheetByName(URUN_SEKMESI), reservations = ss.getSheetByName(REZERVASYON_SEKMESI);
    if (!products || !reservations) throw new Error('Ürün veya rezervasyon sekmesi bulunamadı.');
    SpreadsheetApp.flush();
    const rows = products.getRange(2, 1, products.getLastRow() - 1, 16).getValues();
    const product = rows.find(row => String(row[0]) === String(data.productId));
    if (!product || !isActive_(product[14])) throw new Error('Ürün aktif değil.');
    const available = data.deliveryPoint === 'Spor Salonu 1' ? Number(product[11] || 0) : Number(product[12] || 0);
    if (data.deliveryPoint !== 'Spor Salonu 1' && data.deliveryPoint !== 'Spor Salonu 2') throw new Error('Geçersiz teslim salonu.');
    if (available < quantity) throw new Error('Seçilen salonda yeterli stok bulunmuyor.');
    const id = 'REZ-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    reservations.appendRow([id,new Date(),String(data.productId),String(data.productName),String(data.fullName),String(data.team),String(data.size),quantity,String(data.deliveryPoint),new Date(String(data.deliveryDate) + 'T12:00:00'),'Bekliyor']);
    SpreadsheetApp.flush();
    return {reservationId:id, items:readProducts_()};
  } finally {
    lock.releaseLock();
  }
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
