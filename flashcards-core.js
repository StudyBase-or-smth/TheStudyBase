(function(root){
  'use strict';
  const text=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const normal=value=>String(value||'').normalize('NFKC').toLowerCase().trim().replace(/[.,!?;:]+$/g,'').replace(/\s+/g,' ');
  function baseAnswer(t){return [t.definition,...(t.keyPoints||[]),text(t.formula),text(t.bodyText),text(t.process),text(t.examTip)].filter(Boolean).join('\n');}
  function deck(topics,subject){
    const cards=[],issues=[];
    for(const t of topics){
      const answer=baseAnswer(t),prefix=subject+':'+t.id;
      if(t.flashcardEnabled!==false && answer)cards.push({id:prefix+':base',type:'base',topic:t,q:t.name,a:answer});
      else if(t.flashcardEnabled!==false)issues.push(t.name+': automatic card has no content.');
      const seen=new Set();
      for(const [i,qa] of (t.flashcardQA||[]).entries()){
        const key=normal(qa.q)+'|'+normal(qa.a);
        if(!text(qa.q)||!text(qa.a)){issues.push(t.name+': incomplete question/answer pair.');continue;}
        if(seen.has(key)){issues.push(t.name+': duplicate question/answer pair.');continue;}
        if(qa.q.length>180||qa.a.length>800)issues.push(t.name+': a long card could be split into smaller questions.');
        if(qa.enabled!==false){seen.add(key);cards.push({id:prefix+':qa:'+(qa.id||'qa_'+i),type:'qa',topic:t,q:qa.q,a:qa.a,acceptedAnswers:qa.acceptedAnswers||[],qaId:qa.id||'qa_'+i});}
      }
    }
    return {cards,issues};
  }
  function review(previous,rating,now=Date.now()){
    const old=previous||{},days=rating==='again'?0:rating==='easy'?Math.max(3,(old.interval||1)*3):Math.max(1,(old.interval||0)*2);
    return {...old,interval:days,due:now+(rating==='again'?600000:days*86400000),lastReviewed:now,lastRating:rating,reviews:(old.reviews||0)+1,lapses:(old.lapses||0)+(rating==='again'?1:0),updatedAt:now};
  }
  function matches(value,card){return [card.a,...(card.acceptedAnswers||[])].some(a=>normal(a)===normal(value));}
  function merge(local,remote){
    const a=local||{},b=remote||{},out={v:1,cards:{},sessions:{},goals:{},days:{}};
    for(const kind of ['cards','sessions','goals'])for(const key of new Set([...Object.keys(a[kind]||{}),...Object.keys(b[kind]||{})])){
      const x=a[kind]?.[key],y=b[kind]?.[key];out[kind][key]=!x?y:!y?x:(x.updatedAt||0)>=(y.updatedAt||0)?x:y;
    }
    for(const day of new Set([...Object.keys(a.days||{}),...Object.keys(b.days||{})]))out.days[day]=[...new Set([...(a.days?.[day]||[]),...(b.days?.[day]||[])])];
    return out;
  }
  const api={deck,baseAnswer,review,matches,merge,normal};root.StudyFlashcards=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
