(() => {
  const data=window.SPOR_OKULU_GROUP_SEASON;if(!data)return;
  const norm=v=>String(v||'').replace(/^\(H\)\s*-\s*/i,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR');
  const aliases=[
    ['grup-rbfugc','Midi Kızlar Gelişim Ligi 1.Bölge Kls D','Dev Ataşehir B'],
    ['grup-rbfugd','Midi Kızlar Gelişim Ligi 1.Bölge Kls C','Dev Ataşehir A'],
    ['grup-cskgat','Midi Kızlar 1. Lig 2.Bölge Kls A','Dev Ataşehir'],
    ['grup-efcmot','Mnk And Final','Dev Ataşehir A']
  ];
  aliases.forEach(([id,competition,team])=>{const group=data.groups.find(g=>norm(g.competition)===norm(competition)&&norm(g.trackedTeam)===norm(team));if(group&&!group.teamIds.includes(id))group.teamIds.push(id)});
  const miniL=data.groups.find(g=>norm(g.competition)==='mnk and l grubu');
  if(miniL&&!data.groups.some(g=>g.teamIds?.includes('grup-efgdo2')))data.groups.push({...miniL,trackedTeam:'Dev Ataşehir B',teamIds:['grup-efgdo2']});
})();
