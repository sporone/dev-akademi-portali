(() => {
  const baseTeamTab = window.teamTab;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const norm = value => String(value || '').replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR');
  const standingLogo = name => {
    const value=norm(name).replace(/^\(h\)\s*-\s*/,''),items=[...(window.SPOR_OKULU_LOGOS?.items||[])].sort((a,b)=>norm(b[0]).length-norm(a[0]).length);
    const found=items.find(([label])=>{const key=norm(label);return value===key||new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+(a|b|c|d|[0-9]+)$`,'i').test(value)});
    return found?.[1]||'';
  };
  const standingMark = name => {const src=standingLogo(name);return src?`<span class="federation-mark has-logo"><img src="${esc(src)}" alt="${esc(name)} logosu" loading="lazy"></span>`:`<span class="federation-mark">🏐</span>`};
  const teamLabel = team => team.sourceTeamName || String(team.name || '').split('•').pop().trim();
  const groupsFor = team => (window.SPOR_OKULU_GROUP_SEASON?.groups || []).filter(group => group.teamIds?.includes(team.id) || (group.groupKey === team.groupKey && (norm(teamLabel(team)).includes(norm(group.trackedTeam)) || norm(group.trackedTeam).includes(norm(teamLabel(team))))));
  const score = match => match.completed ? `${esc(match.homeScore)} — ${esc(match.awayScore)}` : '—';
  function standingsTable(group) {
    return `<div class="group-block"><div class="group-block-head"><div><span>${esc(group.groupKey.replaceAll('|',' / '))}</span><h3>${esc(group.competition)}</h3></div><small>${group.standings.length} takım</small></div><div class="table-scroll"><table class="official-standing-table"><thead><tr><th>Takım Adı</th><th>O</th><th>G</th><th>M</th><th>A</th><th>V</th><th>P</th><th>SAV</th><th>ASP</th><th>VSP</th><th>SPAV</th><th>2-0</th><th>2-1</th><th>1-2</th><th>0-2</th><th>NET</th></tr></thead><tbody>${group.standings.map(row => `<tr class="${norm(row.team)===norm(group.trackedTeam)?'tracked-team':''}"><td>${standingMark(row.team)}<b>${esc(row.team)}</b></td><td>${row.played}</td><td class="positive">${row.won}</td><td class="negative">${row.lost}</td><td>${row.setsWon}</td><td>${row.setsLost}</td><td class="points">${row.points}</td><td>${esc(row.setAverage)}</td><td>${row.pointsWon}</td><td>${row.pointsLost}</td><td>${esc(row.pointAverage)}</td><td>${row.win20}</td><td>${row.win21}</td><td>${row.loss12}</td><td>${row.loss02}</td><td>${row.net}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function fixtureTable(group, resultsOnly) {
    const list = resultsOnly ? group.fixtures.filter(match => match.completed) : group.fixtures;
    return `<div class="group-block"><div class="group-block-head"><div><span>${esc(group.groupKey.replaceAll('|',' / '))}</span><h3>${esc(group.competition)} ${resultsOnly?'Maç Sonuçları':'Grup Fikstürü'}</h3></div><small>${list.length} maç</small></div><div class="table-scroll"><table class="group-fixture-table"><thead><tr><th>Tarih</th><th>Saat</th><th>Salon</th><th>Ev Sahibi</th><th>Skor</th><th>Misafir</th><th>Set Sonuçları</th></tr></thead><tbody>${list.map(match => `<tr><td>${esc(match.date)}</td><td>${esc(match.time)}</td><td>${esc(match.venue)}</td><td>${esc(match.home)}</td><td><b>${score(match)}</b></td><td>${esc(match.away)}</td><td>${esc(match.sets || '—')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  window.teamTab = function(team) {
    const groups = groupsFor(team);
    if (groups.length && state.activeTab === 'fixtures') return `<div class="season-data-note"><b>2025–2026 sezonu</b><span>Resmî grup puan durumu ve tam fikstür</span></div>${groups.map(group => standingsTable(group) + fixtureTable(group,false)).join('')}`;
    if (groups.length && state.activeTab === 'results') return `<div class="season-data-note"><b>2025–2026 sezonu</b><span>Bu grupta oynanan tüm maç sonuçları</span></div>${groups.map(group => fixtureTable(group,true)).join('')}`;
    return baseTeamTab(team);
  };
  window.SPOR_OKULU_GROUP_SEASON_READY?.then(() => { const requested=new URLSearchParams(location.search).get('teamtab');if(requested==='fixtures'||requested==='results')state.activeTab=requested;if (location.hash.startsWith('#/takim/')) render(); });
})();
