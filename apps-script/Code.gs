const SHEETS = {
  teams: ['id','name','category','coach','color','logo','athleteCount','groupKey','source'],
  athletes: ['id','teamId','name','number','position','photo'],
  coaches: ['id','name','phone','email'],
  leagues: ['id','name','category','season'],
  matches: ['id','teamId','date','home','away','venue','status','score'],
  attendance: ['matchId','athleteId','status','updatedAt']
};

// Federasyon fikstür/sonuç kaynağı. Bu dosya yalnızca okunur.
const LEAGUE_SOURCE = {
  spreadsheetId: '1-LJHnabJcec-0v2UnHCMhZgu3oFx67QOfhkCLntbrsI',
  clubPattern: /(dev\s+ataşehir|dev\s+spor|[iİ]stanbul\s+dev)/i,
  primarySheet: 'Sayfa1',
  fallbackSheet: 'Eksik Maçlar'
};

// İkinci dosya yalnızca takım, antrenör ve sporcu kadrosu için okunur.
const ROSTER_SOURCE = {
  spreadsheetId: '1TIssy6VRqYMLGtU3Usd4aR7V44ilMDmlGPfDuvJhOOY',
  sheet: 'Sayfa1'
};

// Eğitim menüsündeki sezon takvimi. Resmî kayıtlar ve kullanıcıların
// Google Sheets'e eklediği aktif manuel tatiller birlikte okunur.
const HOLIDAY_SOURCE = {
  spreadsheetId: '1ZNwznn0JCVtWjPxUkmaBqA0m41Q9aeQyIW4nwpjmIb4',
  sheets: ['Resmi Takvim', 'Manuel Tatiller']
};

const ANNOUNCEMENT_SOURCE = {
  spreadsheetId: '19ftKmNyx-bbawy1QJumgQ5qbTTj9F_OHwMTZ-T9k5QY',
  announcementsSheet: 'Duyurular',
  responsesSheet: 'Cevaplar'
};

// İstanbul İl Temsilciliği grup fikstürü ve puan durumu çalışma kitabı.
const STANDINGS_SOURCE = {
  spreadsheetId: '192ChJXFrr-eOBG6CCz8ths_xk9XPNFtZxamihjE0EPE',
  url: 'https://istanbul.voleyboliltemsilciligi.com/PuanDurumu',
  mappingSheet: 'Grup Eslestirmeleri',
  standingsSheet: 'Puan Durumu',
  fixturesSheet: 'Fikstur'
};

const CATEGORY_LABELS = {
  GK: 'Genç Kız', KK: 'Küçük Kız', YK: 'Yıldız Kız',
  MdK: 'Midi Kız', MnK: 'Mini Kız', BYK: 'Büyükler'
};

function setup() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  let folderId = props.getProperty('MEDIA_FOLDER_ID');
  if (!spreadsheetId) {
    const ss = SpreadsheetApp.create('Spor Okulu Sezon Verileri');
    spreadsheetId = ss.getId();
    props.setProperty('SPREADSHEET_ID', spreadsheetId);
  }
  if (!folderId) {
    const folder = DriveApp.createFolder('Spor Okulu Görselleri');
    folderId = folder.getId();
    props.setProperty('MEDIA_FOLDER_ID', folderId);
  }
  const ss = SpreadsheetApp.openById(spreadsheetId);
  Object.keys(SHEETS).forEach((name, index) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = index === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(SHEETS[name]);
    else sh.getRange(1,1,1,SHEETS[name].length).setValues([SHEETS[name]]);
    sh.setFrozenRows(1);
  });
  return { spreadsheetUrl: ss.getUrl(), folderUrl: DriveApp.getFolderById(folderId).getUrl() };
}

function doGet() { return json_({ok:true,data:{service:'spor-okulu-api',status:'ready'}}); }

function doPost(e) {
  try {
    const req = JSON.parse((e.postData && e.postData.contents) || '{}');
    let data;
    if (req.action === 'bootstrap') data = bootstrap_();
    else if (req.action === 'saveEntity') data = saveEntity_(req.entity, req.data);
    else if (req.action === 'saveAttendance') data = saveAttendance_(req.data);
    else if (req.action === 'voteAnnouncement') data = saveAnnouncementVote_(req.data);
    else throw new Error('Geçersiz işlem.');
    return json_({ok:true,data:data});
  } catch (err) { return json_({ok:false,error:err.message}); }
}

function bootstrap_() {
  const out = {};
  Object.keys(SHEETS).forEach(name => out[name] = read_(name));
  const league = readLeagueSource_();
  const roster = readRosterSource_();
  out.matches = league.matches;
  out.teams = mergeLeagueTeams_(out.teams, league.teams);
  out.teams = mergeRosterTeams_(out.teams, roster);
  out.athletes = mergeById_(roster.athletes, out.athletes);
  out.coaches = mergeById_(roster.coaches, out.coaches);
  out.clubs = [{id:'dev-atasehir',name:'Dev Ataşehir'},{id:'dev-spor',name:'Dev Spor'},{id:'istanbul-dev',name:'İstanbul Dev'}];
  out.holidays = readHolidaySource_();
  out.announcements = readAnnouncements_();
  out.standings = readStandings_();
  return out;
}

function readStandings_() {
  const sh = SpreadsheetApp.openById(STANDINGS_SOURCE.spreadsheetId).getSheetByName(STANDINGS_SOURCE.standingsSheet);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,Math.min(16,sh.getLastColumn())).getDisplayValues().map(r => ({
    groupKey:r[0], competition:r[1], team:r[3], played:Number(r[4]||0), won:Number(r[5]||0), lost:Number(r[6]||0),
    setsWon:Number(r[7]||0), setsLost:Number(r[8]||0), points:Number(r[9]||0), setAverage:r[10], pointsWon:Number(r[11]||0),
    pointsLost:Number(r[12]||0), pointAverage:r[13], net:Number(r[14]||0), updatedAt:r[15]
  })).filter(x => x.team);
}

/** Bir kez çalıştırılır: hemen eşitler ve 6 saatlik otomatik yenilemeyi kurar. */
function setupStandingsSync() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncIstanbulStandings').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncIstanbulStandings').timeBased().everyHours(6).create();
  return syncIstanbulStandings();
}

function syncIstanbulStandings() {
  const ss = SpreadsheetApp.openById(STANDINGS_SOURCE.spreadsheetId);
  const mapSheet = ss.getSheetByName(STANDINGS_SOURCE.mappingSheet);
  const outSheet = ss.getSheetByName(STANDINGS_SOURCE.standingsSheet);
  const fixtureSheet = ss.getSheetByName('Resmi Fikstur') || ss.insertSheet('Resmi Fikstur');
  if (!mapSheet || !outSheet) throw new Error('Grup eşleştirme veya puan durumu sayfası bulunamadı.');
  const mappings = mapSheet.getRange(2,1,Math.max(0,mapSheet.getLastRow()-1),4).getDisplayValues().filter(r => r[2]);
  const rows = [];
  const fixtureRows = [];
  mappings.forEach(m => {
    const category = String(m[0]).split('|')[1] || '';
    const page = fetchStandingsPage_(category,m[2]);
    parseHtmlTable_(page,'icerik_GvTemplate_S3').forEach((r,index) => {
      if (!index || r.length < 11) return;
      rows.push([m[0],m[1],m[2],r[0],num_(r[1]),num_(r[2]),num_(r[3]),num_(r[4]),num_(r[5]),num_(r[6]),r[7],num_(r[8]),num_(r[9]),r[10],num_(r[11]||r[6]),new Date()]);
    });
    parseHtmlTable_(page,'icerik_gvmusabakaliste').forEach((r,index) => {
      if (!index && r.some(x => /tarih|takım|salon|sonuç/i.test(x))) return;
      if (r.length) fixtureRows.push([m[0],m[1],m[2],new Date()].concat(r.slice(0,20)));
    });
  });
  if (rows.length) {
    if (outSheet.getLastRow() > 1) outSheet.getRange(2,1,outSheet.getLastRow()-1,outSheet.getLastColumn()).clearContent();
    outSheet.getRange(2,1,rows.length,16).setValues(rows);
  }
  fixtureSheet.clearContents();
  const fixtureHeaders = ['Grup Kodu','Yarışma','Yarışma Değeri','Güncelleme'].concat(Array.from({length:20},(_,i) => 'Kaynak Alan '+(i+1)));
  fixtureSheet.getRange(1,1,1,fixtureHeaders.length).setValues([fixtureHeaders]);
  if (fixtureRows.length) fixtureSheet.getRange(2,1,fixtureRows.length,fixtureHeaders.length).setValues(fixtureRows.map(r => r.concat(Array(fixtureHeaders.length-r.length).fill(''))));
  fixtureSheet.setFrozenRows(1);
  return {updatedAt:new Date().toISOString(), groups:mappings.length, standingsRows:rows.length, fixtureRows:fixtureRows.length};
}

function fetchStandingsPage_(category, competition) {
  let response = UrlFetchApp.fetch(STANDINGS_SOURCE.url,{muteHttpExceptions:true});
  let html = response.getContentText('UTF-8');
  const headers = response.getAllHeaders();
  const rawCookie = headers['Set-Cookie'] || headers['set-cookie'] || '';
  const cookie = (Array.isArray(rawCookie) ? rawCookie : [rawCookie]).map(x => String(x).split(';')[0]).join('; ');
  [['ctl00$icerik$ddlsbe','B'],['ctl00$icerik$ddlSkategori',category],['ctl00$icerik$ddlSyarismaadi',competition]].forEach(step => {
    const payload = hiddenFields_(html);
    payload.__EVENTTARGET = step[0]; payload.__EVENTARGUMENT = '';
    payload['ctl00$icerik$ddlSil'] = '34'; payload['ctl00$icerik$ddlsbe'] = 'B';
    payload['ctl00$icerik$ddlSkategori'] = category; payload['ctl00$icerik$ddlskume'] = '0';
    payload['ctl00$icerik$ddlSyarismaadi'] = step[0].indexOf('ddlSyarismaadi') > -1 ? competition : '';
    response = UrlFetchApp.fetch(STANDINGS_SOURCE.url,{method:'post',payload:payload,headers:{Cookie:cookie},followRedirects:true,muteHttpExceptions:true});
    html = response.getContentText('UTF-8');
  });
  return html;
}

function hiddenFields_(html) {
  const fields = {};
  String(html).replace(/<input[^>]+type=["']hidden["'][^>]*>/gi, tag => {
    const name = attr_(tag,'name'), value = attr_(tag,'value'); if (name) fields[name] = value;
  });
  return fields;
}

function parseHtmlTable_(html,id) {
  const start = String(html).search(new RegExp('<table[^>]+id=["\']'+id+'["\']','i'));
  if (start < 0) return [];
  const end = String(html).indexOf('</table>',start);
  const table = String(html).slice(start,end+8), rows=[];
  table.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi,(_,tr) => { const cells=[]; tr.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi,(__,cell)=>cells.push(cleanHtml_(cell))); if(cells.length) rows.push(cells); return _; });
  return rows;
}

function attr_(tag,name) { const m=String(tag).match(new RegExp(name+'=["\']([\s\S]*?)["\']','i')); return m ? cleanHtml_(m[1]) : ''; }
function cleanHtml_(value) { return String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#304;/g,'İ').replace(/&#305;/g,'ı').replace(/\s+/g,' ').trim(); }
function num_(value) { const n=Number(String(value||'').replace(',','.')); return isNaN(n) ? 0 : n; }

function readAnnouncements_() {
  const ss = SpreadsheetApp.openById(ANNOUNCEMENT_SOURCE.spreadsheetId);
  const sh = ss.getSheetByName(ANNOUNCEMENT_SOURCE.announcementsSheet);
  const responseSheet = ss.getSheetByName(ANNOUNCEMENT_SOURCE.responsesSheet);
  if (!sh) return [];
  const tz = 'Europe/Istanbul';
  const totals = {};
  if (responseSheet && responseSheet.getLastRow() > 1) responseSheet.getRange(2,1,responseSheet.getLastRow()-1,6).getValues().forEach(r => {
    const id=String(r[1]||''), answer=String(r[2]||'');
    if (!totals[id]) totals[id]={yes:0,no:0};
    if (answer === 'Evet') totals[id].yes++; else if (answer === 'Hayır') totals[id].no++;
  });
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2,1,sh.getLastRow()-1,8).getValues().filter(r => r[0] && (r[5] === true || String(r[5]).toLowerCase() === 'true')).map(r => {
    const format=v => v instanceof Date ? Utilities.formatDate(v,tz,"yyyy-MM-dd'T'HH:mm:ssXXX") : String(v||'');
    const count=totals[String(r[0])]||{yes:Number(r[6]||0),no:Number(r[7]||0)};
    return {id:String(r[0]),title:String(r[1]||''),description:String(r[2]||''),publishDate:format(r[3]),endDate:format(r[4]),active:true,yes:count.yes,no:count.no};
  });
}

function saveAnnouncementVote_(data) {
  if (!data || !data.announcementId || !/^(Evet|Hayır)$/.test(String(data.answer)) || !data.deviceId) throw new Error('Geçersiz anket yanıtı.');
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss=SpreadsheetApp.openById(ANNOUNCEMENT_SOURCE.spreadsheetId);
    const announcements=ss.getSheetByName(ANNOUNCEMENT_SOURCE.announcementsSheet);
    const responses=ss.getSheetByName(ANNOUNCEMENT_SOURCE.responsesSheet);
    if (!announcements || !responses) throw new Error('Duyuru veri sekmeleri bulunamadı.');
    const rows=announcements.getRange(2,1,Math.max(announcements.getLastRow()-1,1),8).getValues();
    const rowIndex=rows.findIndex(r=>String(r[0])===String(data.announcementId));
    if (rowIndex < 0 || !(rows[rowIndex][5]===true || String(rows[rowIndex][5]).toLowerCase()==='true')) throw new Error('Duyuru aktif değil.');
    const deadline=rows[rowIndex][4];
    if (deadline instanceof Date && deadline < new Date()) throw new Error('Bu anketin cevap süresi doldu.');
    const existing=responses.getLastRow()>1?responses.getRange(2,1,responses.getLastRow()-1,6).getValues():[];
    if (existing.some(r=>String(r[1])===String(data.announcementId)&&String(r[3])===String(data.deviceId))) throw new Error('Bu cihazdan daha önce yanıt verilmiş.');
    responses.appendRow([Utilities.getUuid(),String(data.announcementId),String(data.answer),String(data.deviceId),new Date(),'Geçerli']);
    const yes=existing.filter(r=>String(r[1])===String(data.announcementId)&&String(r[2])==='Evet').length+(data.answer==='Evet'?1:0);
    const no=existing.filter(r=>String(r[1])===String(data.announcementId)&&String(r[2])==='Hayır').length+(data.answer==='Hayır'?1:0);
    announcements.getRange(rowIndex+2,7,1,2).setValues([[yes,no]]);
    return {announcementId:String(data.announcementId),answer:String(data.answer),yes:yes,no:no};
  } finally { lock.releaseLock(); }
}

function readHolidaySource_() {
  const ss = SpreadsheetApp.openById(HOLIDAY_SOURCE.spreadsheetId);
  const tz = 'Europe/Istanbul';
  const out = [];
  HOLIDAY_SOURCE.sheets.forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function(r) {
      const active = r[8] === true || String(r[8]).toLowerCase() === 'true';
      if (!active || !r[1] || !r[3]) return;
      const format = function(v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).slice(0, 10); };
      out.push({id:String(r[0] || Utilities.getUuid()),start:format(r[1]),end:format(r[2] || r[1]),title:String(r[3]),category:String(r[4] || 'Diğer'),duration:String(r[5] || 'Bilgi'),note:String(r[6] || ''),source:String(r[7] || name),active:true});
    });
  });
  return out;
}

function readRosterSource_() {
  const source = SpreadsheetApp.openById(ROSTER_SOURCE.spreadsheetId);
  const sh = source.getSheetByName(ROSTER_SOURCE.sheet);
  if (!sh) throw new Error('Kadro kaynağında Sayfa1 bulunamadı.');
  const rows = sh.getRange(1,1,sh.getLastRow(),8).getDisplayValues();
  let team = '', group = '', coach = '';
  const teams = {}, athletes = [], coaches = {};
  rows.forEach((r,index) => {
    const first = String(r[0] || '').trim();
    if (first.toLocaleLowerCase('tr-TR') === 'takım adı') { team=''; group=''; coach=''; return; }
    if (first) team = first;
    if (String(r[1] || '').trim()) group = String(r[1]).trim();
    if (String(r[2] || '').trim()) coach = String(r[2]).replace(/\s+/g,' ').trim();
    const number = String(r[3] || '').trim();
    const name = String(r[4] || '').replace(/\s+/g,' ').trim();
    const position = String(r[5] || '').replace(/\s+/g,' ').trim();
    if (!team || !group) return;
    const groupParts = group.split(/\s+/);
    while (groupParts.length < 4) groupParts.push('-');
    const groupKey = groupParts.slice(0,4).join('|');
    const rosterKey = team.toLocaleLowerCase('tr-TR')+'|'+groupKey;
    const teamId = 'kadro-' + shortHash_(rosterKey);
    const clubFamily = clubFamily_(team);
    if (!teams[rosterKey]) teams[rosterKey] = {rosterKey:rosterKey,groupKey:groupKey,teamId:teamId,teamName:team,coach:coach,sourceRow:index+1,clubFamily:clubFamily,color:clubColor_(clubFamily),rosterOnly:true};
    if (!name) return;
    const upper = name.toLocaleUpperCase('tr-TR');
    if (upper === 'AD' || upper === 'OYUNCU ADI' || upper.indexOf('AD SOYAD') === 0 || position.toLocaleLowerCase('tr-TR') === 'mevki') return;
    if (coach) coaches[coach] = {id:'antrenor-'+shortHash_(coach),name:coach,phone:'',email:'',source:'roster-google-sheets'};
    athletes.push({id:'sporcu-'+shortHash_(rosterKey+'|'+upper+'|'+(index+1)),teamId:teamId,name:name,number:number,position:position,photo:'',groupKey:groupKey,rosterKey:rosterKey,clubFamily:clubFamily,sourceSheet:ROSTER_SOURCE.sheet,sourceRow:index+1,source:'roster-google-sheets'});
  });
  return {teams:Object.keys(teams).map(k=>teams[k]),athletes:athletes,coaches:Object.keys(coaches).map(k=>coaches[k])};
}

function mergeRosterTeams_(leagueTeams, roster) {
  const rosterTeams = roster.teams, rosterByKey = {}, remap = {};
  rosterTeams.forEach(t => rosterByKey[t.rosterKey] = t);
  const merged = leagueTeams.map(t => {
    const sourceName = t.clubVariant || t.sourceTeamName || String(t.name || '').split('•').pop();
    const key = String(sourceName).replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR')+'|'+t.groupKey;
    const r = rosterByKey[key];
    if (r) remap[r.teamId] = t.id;
    return r ? Object.assign({},t,{coach:r.coach,rosterLinked:true,rosterSourceId:ROSTER_SOURCE.spreadsheetId,clubFamily:r.clubFamily,sourceTeamName:r.teamName}) : Object.assign({},t,{clubFamily:'dev-atasehir'});
  });
  roster.athletes.forEach(a => { if (remap[a.teamId]) a.teamId=remap[a.teamId]; });
  rosterTeams.forEach(r => {
    if (remap[r.teamId]) return;
    const p = r.groupKey.split('|');
    merged.push({id:r.teamId,name:categoryName_(p[1])+' • '+r.teamName,category:p.join(' · '),groupKey:r.groupKey,coach:r.coach,logo:'',color:r.color,athleteCount:0,source:'roster-google-sheets',rosterLinked:true,rosterOnly:true,clubFamily:r.clubFamily,sourceTeamName:r.teamName});
  });
  return merged;
}

function clubFamily_(name) { return name.indexOf('Dev Ataşehir') === 0 ? 'dev-atasehir' : name.indexOf('Dev Spor') === 0 ? 'dev-spor' : name.indexOf('İstanbul Dev') === 0 ? 'istanbul-dev' : 'diger'; }
function clubColor_(family) { return ({'dev-atasehir':'#0e8c60','dev-spor':'#7857cf','istanbul-dev':'#e47745'})[family] || '#3181bb'; }

function mergeById_(preferred, secondary) {
  const result = [], seen = {};
  (preferred || []).concat(secondary || []).forEach(x => { if (!seen[x.id]) { seen[x.id]=true; result.push(x); } });
  return result;
}

/**
 * Dış kaynak çalışma kitabını salt okunur biçimde işler.
 * Ana sayfa önceliklidir; Eksik Maçlar yalnızca bulunmayan maçları tamamlar.
 */
function readLeagueSource_() {
  const source = SpreadsheetApp.openById(LEAGUE_SOURCE.spreadsheetId);
  const primary = source.getSheetByName(LEAGUE_SOURCE.primarySheet);
  const fallback = source.getSheetByName(LEAGUE_SOURCE.fallbackSheet);
  if (!primary) throw new Error('Lig kaynağında Sayfa1 bulunamadı.');

  const records = [];
  primary.getDataRange().getDisplayValues().slice(1).forEach((r, index) => {
    const rowNumber = index + 2;
    const matches = normalizePrimaryMatch_(r, rowNumber, primary.isRowHiddenByUser(rowNumber) || primary.isRowHiddenByFilter(rowNumber));
    if (matches) records.push.apply(records,matches);
  });
  if (fallback) fallback.getDataRange().getDisplayValues().slice(1).forEach((r, index) => {
    const matches = normalizeFallbackMatch_(r, index + 2);
    if (matches) records.push.apply(records,matches);
  });

  // Aynı maç iki sekmede varsa ana sayfadaki kayıt kazanır.
  const unique = {};
  records.forEach(m => { if (!unique[m.dedupeKey]) unique[m.dedupeKey] = m; });
  const matches = Object.keys(unique).map(key => {
    const m = unique[key]; delete m.dedupeKey; return m;
  }).sort((a,b) => String(a.date).localeCompare(String(b.date)));

  const groups = {};
  matches.forEach(m => {
    if (!groups[m.teamId]) groups[m.teamId] = {
      id: m.teamId,
      name: categoryName_(m.categoryCode) + (m.clubVariant ? ' • ' + m.clubVariant : ''),
      category: [m.leagueCode, categoryName_(m.categoryCode), phaseName_(m.phaseCode), 'Grup ' + m.groupCode].filter(Boolean).join(' · '),
      groupKey: m.groupKey,
      coach: '', logo: '', color: colorFor_(m.teamId), athleteCount: 0,
      source: 'google-sheets'
    };
  });
  return {matches:matches, teams:Object.keys(groups).map(k => groups[k])};
}

function normalizePrimaryMatch_(r, rowNumber, hiddenSource) {
  const home = cleanClub_(r[3]), away = cleanClub_(r[6]);
  if (!LEAGUE_SOURCE.clubPattern.test(home) && !LEAGUE_SOURCE.clubPattern.test(away)) return null;
  const group = [r[10],r[11],r[12],r[13] || '-'];
  return makeMatches_({date:r[0],time:r[2],venue:r[1],home:home,homeScore:r[4],awayScore:r[5],away:away,sets:r[7],duration:r[8],competitionCode:r[9],group:group,source:'Sayfa1',row:rowNumber,hiddenSource:hiddenSource});
}

function normalizeFallbackMatch_(r, rowNumber) {
  // Bu sekmede görünen başlıkların aksine B=saat, C=salon sırasındadır.
  const home = cleanClub_(r[3]), away = cleanClub_(r[6]);
  if (!LEAGUE_SOURCE.clubPattern.test(home) && !LEAGUE_SOURCE.clubPattern.test(away)) return null;
  const group = String(r[8] || '').trim().split(/\s+/);
  while (group.length < 4) group.push('-');
  return makeMatches_({date:r[0],time:r[1],venue:r[2],home:home,homeScore:r[4],awayScore:r[5],away:away,sets:r[7],group:group.slice(0,4),source:'Eksik Maçlar',row:rowNumber});
}

function makeMatches_(x) {
  const clubs=[x.home,x.away].filter(name=>LEAGUE_SOURCE.clubPattern.test(name));
  return clubs.map(clubName=>makeMatch_(Object.assign({},x,{clubName:clubName})));
}

function makeMatch_(x) {
  const groupKey = x.group.join('|');
  const clubName = x.clubName || (LEAGUE_SOURCE.clubPattern.test(x.home) ? x.home : x.away);
  const idBase = [x.date,x.time,x.home,x.away,groupKey].join('|');
  const played = x.homeScore !== '' && x.awayScore !== '' && !(x.homeScore === '0' && x.awayScore === '0');
  return {
    id:'mac-' + shortHash_(clubName+'|'+idBase), teamId:'grup-' + shortHash_(clubName+'|'+groupKey),
    date:toIsoDate_(x.date,x.time), home:x.home, away:x.away, venue:x.venue,
    status:played ? 'completed' : 'upcoming', score:played ? x.homeScore + ' - ' + x.awayScore : '',
    setScores:x.sets, duration:x.duration || '', competitionCode:x.competitionCode || '', groupKey:groupKey, leagueCode:x.group[0], categoryCode:x.group[1],
    phaseCode:x.group[2], groupCode:x.group[3], clubVariant:clubName,
    sourceSheet:x.source, sourceRow:x.row, hiddenSource:!!x.hiddenSource,
    dedupeKey:[clubName,x.date,x.time,x.home,x.away].join('|').toLocaleLowerCase('tr-TR')
  };
}

function mergeLeagueTeams_(managed, generated) {
  const byGroup = {};
  (managed || []).forEach(t => { if (t.groupKey) byGroup[t.groupKey] = t; });
  return generated.map(g => Object.assign({},g,byGroup[g.groupKey] || {},{id:g.id,groupKey:g.groupKey,source:g.source}));
}

function cleanClub_(name) { return String(name || '').replace(/^\(H\)\s*-\s*/i,'').trim(); }
function categoryName_(code) { return CATEGORY_LABELS[code] || code || 'Takım'; }
function phaseName_(code) { return ({KL:'Klasman',LE:'Lig Etabı',YF:'Yarı Final',FI:'Final',GR:'Grup'})[code] || code; }
function toIsoDate_(date,time) { const p=String(date).split('.'); return p.length===3 ? p[2]+'-'+p[1]+'-'+p[0]+'T'+(time || '00:00')+':00' : date; }
function shortHash_(text) { let h=0; for (let i=0;i<text.length;i++) h=((h<<5)-h)+text.charCodeAt(i)|0; return Math.abs(h).toString(36); }
function colorFor_(text) { const colors=['#0e8c60','#7857cf','#e47745','#3181bb','#b44d79','#738d2d']; return colors[parseInt(shortHash_(text),36)%colors.length]; }

function saveEntity_(entity, data) {
  const map = {team:'teams',athlete:'athletes',coach:'coaches'};
  const sheetName = map[entity];
  if (!sheetName) throw new Error('Bu veri türü panelden düzenlenemez.');
  if (data.photo && data.photo.base64) data.photo = upload_(data.photo);
  if (data.logo && data.logo.base64) data.logo = upload_(data.logo);
  upsert_(sheetName, data, 'id');
  return data;
}

function saveAttendance_(data) {
  if (!data.matchId) throw new Error('Maç seçimi zorunludur.');
  const sh = sheet_('attendance');
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) if (String(values[i][0]) === String(data.matchId)) sh.deleteRow(i + 1);
  (data.records || []).forEach(r => sh.appendRow([data.matchId,r.athleteId,r.status,new Date().toISOString()]));
  return {saved:(data.records || []).length};
}

function read_(name) {
  const values = sheet_(name).getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(Boolean)).map(row => headers.reduce((o,h,i) => (o[h]=row[i],o),{}));
}

function upsert_(name, obj, key) {
  const sh = sheet_(name), headers = SHEETS[name], rows = sh.getDataRange().getValues();
  const row = headers.map(h => obj[h] == null ? '' : obj[h]);
  const keyCol = headers.indexOf(key), found = rows.findIndex((r,i) => i > 0 && String(r[keyCol]) === String(obj[key]));
  if (found > 0) sh.getRange(found + 1,1,1,row.length).setValues([row]); else sh.appendRow(row);
}

function upload_(file) {
  const bytes = Utilities.base64Decode(file.base64);
  const blob = Utilities.newBlob(bytes,file.type || 'application/octet-stream',file.name || 'gorsel');
  const saved = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('MEDIA_FOLDER_ID')).createFile(blob);
  saved.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + saved.getId();
}

function sheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Önce Apps Script editöründe setup() çalıştırılmalıdır.');
  return SpreadsheetApp.openById(id).getSheetByName(name);
}

function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
