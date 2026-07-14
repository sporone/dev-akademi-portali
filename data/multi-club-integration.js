(() => {
  const snapshot=window.SPOR_OKULU_SNAPSHOT,roster=window.SPOR_OKULU_ROSTER,incoming=window.SPOR_OKULU_MULTI_CLUB_MATCHES||[];
  if(!snapshot||!roster||!incoming.length)return;
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR');
  const rosterMap=new Map((roster.teams||[]).map(t=>[`${norm(t.teamName)}|${t.groupKey}`,t]));
  const teamIds=new Set((snapshot.teams||[]).map(t=>t.id));
  const matchKeys=new Set((snapshot.matches||[]).map(m=>`${m.teamId}|${m.date}|${norm(m.home)}|${norm(m.away)}`));
  const labels={GK:'Genç Kız',KK:'Küçük Kız',YK:'Yıldız Kız',MdK:'Midi Kız',MnK:'Mini Kız'};
  const hash=text=>{let h=0;for(let i=0;i<text.length;i++)h=((h<<5)-h)+text.charCodeAt(i)|0;return Math.abs(h).toString(36)};
  incoming.forEach(m=>{
    const familyPrefix=m.clubFamily==='dev-spor'?'dev spor':'istanbul dev';
    const exactTeam=[m.home,m.away].find(name=>norm(name).startsWith(familyPrefix));
    if(exactTeam){m.sourceTeamName=exactTeam;m.clubVariant=exactTeam}
    const groupParts=m.groupKey.split('|');
    const linked=rosterMap.get(`${norm(m.sourceTeamName)}|${m.groupKey}`)||(roster.teams||[]).find(t=>norm(t.teamName)===norm(m.sourceTeamName)&&t.groupKey.split('|').slice(0,2).join('|')===groupParts.slice(0,2).join('|'));
    m.teamId=linked?.teamId||`kaynak-${m.clubFamily}-${hash(`${m.sourceTeamName}|${m.groupKey}`)}`;
    if(!linked&&!teamIds.has(m.teamId)){const p=m.groupKey.split('|');snapshot.teams.push({id:m.teamId,name:`${labels[p[1]]||p[1]} • ${m.sourceTeamName}`,category:p.join(' · '),groupKey:m.groupKey,coach:'',logo:'',color:m.clubFamily==='dev-spor'?'#7857cf':'#e47745',athleteCount:0,source:'google-sheets',clubFamily:m.clubFamily,sourceTeamName:m.sourceTeamName});teamIds.add(m.teamId)}
    const key=`${m.teamId}|${m.date}|${norm(m.home)}|${norm(m.away)}`;
    if(!matchKeys.has(key)){snapshot.matches.push(m);matchKeys.add(key)}
  });
})();
