'use strict';
const fs=require('node:fs');
const {validUid}=require('./access-policy');
function clock(now,zone){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {day:parts.year+'-'+parts.month+'-'+parts.day,time:parts.hour+':'+parts.minute};
}
function validateStudyState(value){
  if(!value||value.v!==1||['cards','sessions','goals','days'].some(k=>!value[k]||typeof value[k]!=='object'||Array.isArray(value[k]))||JSON.stringify(value).length>2000000)throw {statusCode:400,message:'Invalid flashcard study data'};
  if(Object.keys(value.goals).length>50)throw {statusCode:400,message:'Too many study goals'};
  for(const list of Object.values(value.days))if(!Array.isArray(list)||list.some(id=>typeof id!=='string'||id.length>500))throw {statusCode:400,message:'Invalid study history'};
  for(const kind of ['cards','sessions'])for(const record of Object.values(value[kind]))if(!record||typeof record!=='object'||Array.isArray(record))throw {statusCode:400,message:'Invalid study record'};
  for(const [id,g] of Object.entries(value.goals)){
    if(!g||g.id!==id||!Number.isInteger(g.target)||g.target<1||g.target>500||typeof g.subjectId!=='string'||!g.subjectId||g.subjectId.length>100||typeof g.title!=='string'||g.title.length>160||!/^\d{2}:\d{2}$/.test(g.time)||g.time>'23:59'||g.time.slice(3)>'59')throw {statusCode:400,message:'Invalid study goal'};
    try{if(typeof g.timeZone!=='string'||!g.timeZone)throw Error();clock(Date.now(),g.timeZone);}catch{throw {statusCode:400,message:'Invalid reminder timezone'};}
  }
  return value;
}
function runReminders({jsonDir,readKey,writeKey,now=Date.now()}){
  const sent=readKey('_study_reminders_sent')||{},store=readKey('studybase_notifications'),items=Array.isArray(store)?store:(store?.items||[]);let changed=false;
  for(const file of fs.readdirSync(jsonDir)){
    const match=/^_flashcards_([A-Za-z0-9_-]+)\.json$/.exec(file);if(!match||!validUid(match[1]))continue;
    const uid=match[1],state=readKey('_flashcards_'+uid);try{validateStudyState(state);}catch{continue;}
    for(const goal of Object.values(state.goals)){
      if(goal.enabled===false)continue;
      const local=clock(now,goal.timeZone),count=new Set((Array.isArray(state.days[local.day])?state.days[local.day]:[]).filter(id=>typeof id==='string'&&id.startsWith(goal.subjectId+':'))).size;
      const type=count>=goal.target?'complete':goal.reminderEnabled&&local.time>=goal.time?'reminder':null;if(!type)continue;
      const key=uid+'|'+goal.id+'|'+local.day+'|'+type;if(sent[key])continue;
      items.push({id:'study_'+require('node:crypto').createHash('sha256').update(key).digest('hex').slice(0,24),kind:'text',text:type==='complete'?'🎯 Daily goal reached: '+goal.title+' — '+count+' cards reviewed.':'🃏 Study reminder: '+goal.title+' — '+count+' / '+goal.target+' cards reviewed today.',createdAt:new Date(now).toISOString(),fromName:'StudyBase',fromUid:'',target:{kind:'user',uid},audience:[uid],readBy:[],href:'subject/flashcards.html#'+encodeURIComponent(goal.subjectId)});
      sent[key]=now;changed=true;
    }
  }
  if(changed){writeKey('studybase_notifications',{items});for(const key of Object.keys(sent))if(now-sent[key]>90*86400000)delete sent[key];writeKey('_study_reminders_sent',sent);}
}
module.exports={clock,validateStudyState,runReminders};
