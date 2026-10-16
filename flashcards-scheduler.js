// StudyBase scheduling adapter. Scheduler implementation: MIT-licensed ts-fsrs.
(function(root){
  'use strict';
  const lib=typeof module!=='undefined'&&module.exports?require('ts-fsrs'):root.FSRS;
  const fields=['due','stability','difficulty','elapsed_days','scheduled_days','learning_steps','reps','lapses','state','last_review'];
  const grades={again:lib.Rating.Again,hard:lib.Rating.Hard,good:lib.Rating.Good,easy:lib.Rating.Easy};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const time=value=>Number.isFinite(new Date(value).getTime())?new Date(value).getTime():0;
  const id=()=>root.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  function settings(value={}){
    return {...value,desiredRetention:Math.min(.97,Math.max(.8,Number(value.desiredRetention)||.9)),newCardsPerDay:Number.isInteger(value.newCardsPerDay)?Math.min(1000,Math.max(0,value.newCardsPerDay)):20};
  }
  function scheduler(retention){return lib.fsrs({request_retention:settings({desiredRetention:retention}).desiredRetention,enable_fuzz:false,enable_short_term:true});}
  function serialize(card){const out={};for(const key of fields)out[key]=key==='due'||key==='last_review'?(card[key]?new Date(card[key]).toISOString():null):card[key];return out;}
  function hydrate(card){const out=serialize(card);return {...out,due:new Date(out.due),last_review:out.last_review?new Date(out.last_review):undefined};}
  function migrate(previous={},now=0){
    if(previous.fsrsVersion===1)return clone(previous);
    const empty=serialize(lib.createEmptyCard(new Date(now)));
    return {...clone(previous),...(Object.keys(previous).length?{legacyScheduling:clone(previous)}:{}),...empty,fsrsVersion:1,fsrsBaseline:empty,reviewLog:{}};
  }
  function interval(due,now){
    const minutes=Math.max(1,Math.round((time(due)-time(now))/60000));
    if(minutes<60)return minutes+'m';if(minutes<1440)return Math.round(minutes/60)+'h';
    const days=Math.round(minutes/1440);return days<14?days+'d':days<60?Math.round(days/7)+'w':days<365?Math.round(days/30)+'mo':(days/365).toFixed(1).replace(/\.0$/,'')+'y';
  }
  function preview(previous,now=Date.now(),retention=.9){
    const card=migrate(previous),repeat=scheduler(retention).repeat(hydrate(card),new Date(now)),out={};
    for(const [name,grade] of Object.entries(grades)){const item=repeat[grade];out[name]={...item,interval:interval(item.card.due,now)};}
    return out;
  }
  function review(previous,rating,now=Date.now(),options={}){
    if(!grades[rating])throw Error('Choose Again, Hard, Good or Easy.');
    const card=migrate(previous),eventId=options.eventId||id();
    if(card.reviewLog[eventId])return card;
    const result=preview(card,now,options.retention)[rating];
    const event={id:eventId,rating,timestamp:new Date(now).toISOString(),previousState:serialize(card),result:serialize(result.card),log:clone(result.log),retention:settings({desiredRetention:options.retention}).desiredRetention,day:options.day||new Date(now).toISOString().slice(0,10)};
    return {...card,...serialize(result.card),reviewLog:{...card.reviewLog,[eventId]:event},lastRating:rating,lastReviewed:now,reviews:(card.reviews||0)+1,updatedAt:now};
  }
  function newest(a,b){return !a?b:!b?a:(a.updatedAt||0)>=(b.updatedAt||0)?a:b;}
  function mergeCard(a,b){
    if(!a&&!b)return migrate();a=a||b;b=b||a;
    const latest=newest(a,b),out={...clone(a),...clone(b),...clone(latest)};
    if(a.fsrsVersion!==1&&b.fsrsVersion!==1)return migrate(out);
    const x=migrate(a),y=migrate(b);
    const baseline=time(x.fsrsBaseline.due)<=time(y.fsrsBaseline.due)?x.fsrsBaseline:y.fsrsBaseline;
    const logs={...y.reviewLog,...x.reviewLog};let card=hydrate(baseline);
    for(const event of Object.values(logs).sort((u,v)=>time(u.timestamp)-time(v.timestamp)||u.id.localeCompare(v.id))){
      const now=Math.max(time(event.timestamp),time(card.last_review));
      card=scheduler(event.retention).repeat(card,new Date(now))[grades[event.rating]].card;
    }
    const events=Object.values(logs).sort((u,v)=>time(u.timestamp)-time(v.timestamp)||u.id.localeCompare(v.id)),last=events.at(-1);
    return {...out,...serialize(card),fsrsVersion:1,fsrsBaseline:clone(baseline),reviewLog:logs,...(last?{lastRating:last.rating,lastReviewed:time(last.timestamp)}:{})};
  }
  function merge(local={},remote={}){
    const a=local||{},b=remote||{},out={...a,...b,v:1,schedulingVersion:1,cards:{},sessions:{},goals:{},days:{},imports:{},settings:settings(newest(a.settings,b.settings)),pendingReviewIds:a.pendingReviewIds||[]};
    for(const kind of ['cards','sessions','goals','imports'])for(const key of new Set([...Object.keys(a[kind]||{}),...Object.keys(b[kind]||{})])){
      out[kind][key]=kind==='cards'?mergeCard(a[kind]?.[key],b[kind]?.[key]):newest(a[kind]?.[key],b[kind]?.[key]);
    }
    for(const day of new Set([...Object.keys(a.days||{}),...Object.keys(b.days||{})]))out.days[day]=[...new Set([...(a.days?.[day]||[]),...(b.days?.[day]||[])])];
    return out;
  }
  function introducedToday(data,day){
    return new Set(Object.entries(data.cards||{}).filter(([,card])=>Object.values(card.reviewLog||{}).some(log=>log.day===day&&log.previousState.state===lib.State.New)).map(([key])=>key)).size;
  }
  function queue(cards,data,now=Date.now(),day=new Date(now).toISOString().slice(0,10)){
    const due=[],learning=[],fresh=[];
    for(const card of cards){const state=migrate(data.cards[card.id]);if(state.hidden)continue;
      if(state.state===lib.State.New)fresh.push(card);
      else if(time(state.due)<=now)(state.state===lib.State.Review?due:learning).push(card);
    }
    const sort=(a,b)=>time(data.cards[a.id]?.due)-time(data.cards[b.id]?.due)||a.id.localeCompare(b.id);
    const allowance=Math.max(0,settings(data.settings).newCardsPerDay-introducedToday(data,day));
    const newCards=fresh.sort(sort).slice(0,allowance),scheduled=[...due,...learning].sort(sort);
    return {cards:[...scheduled,...newCards],counts:{new:newCards.length,learning:learning.length,due:due.length},allowance};
  }
  function parseImport(input){
    const cards=[],issues=[];let skipped=0;
    for(const [i,line] of String(input).replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
      if(!line.trim()||line.trimStart().startsWith('#'))continue;
      const parts=line.split('\t');
      if(parts.length<2||parts.length>3||!parts[0].trim()||!parts[1].trim()||parts[0].length>5000||parts[1].length>20000){skipped++;issues.push('Line '+(i+1)+': expected front, tab, back and optional tags.');continue;}
      const tags=(parts[2]||'').trim().split(/[\s,]+/).filter(Boolean);
      if(tags.some(tag=>tag.length>200)){skipped++;issues.push('Line '+(i+1)+': each tag must be 200 characters or fewer.');continue;}
      cards.push({front:parts[0].trim(),back:parts[1].trim(),tags});
    }
    return {cards,skipped,issues};
  }
  const api={migrate,preview,review,merge,queue,settings,introducedToday,parseImport,interval,id,State:lib.State};
  root.StudyFSRS=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
