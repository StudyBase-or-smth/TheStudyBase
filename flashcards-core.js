(function(root){
  'use strict';
  const scheduling=typeof module!=='undefined'&&module.exports?require('./flashcards-scheduler'):root.StudyFSRS;
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
  function matches(value,card){return [card.a,...(card.acceptedAnswers||[])].some(a=>normal(a)===normal(value));}
  const api={...scheduling,deck,baseAnswer,matches,normal};root.StudyFlashcards=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
