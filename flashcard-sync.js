'use strict';
// Merge immutable review events by ID, so a retried offline upload is idempotent.
// Scheduling is replayed with ts-fsrs by the client after reading the merged log.
function latest(a,b){return !a?b:!b?a:(a.updatedAt||0)>=(b.updatedAt||0)?a:b;}
function mergeFlashcards(a,b){
  if(!a)return b;
  const out={...a,...b,cards:{},sessions:{},goals:{},imports:{},days:{}};
  delete out.pendingReviewIds;
  for(const kind of ['cards','sessions','goals','imports'])for(const key of new Set([...Object.keys(a[kind]||{}),...Object.keys(b[kind]||{})])){
    const x=a[kind]?.[key],y=b[kind]?.[key];
    out[kind][key]=kind==='cards'&&x&&y?{...x,...y,...latest(x,y),...((x.reviewLog||y.reviewLog)?{reviewLog:{...y.reviewLog,...x.reviewLog}}:{})}:latest(x,y);
  }
  out.settings=latest(a.settings,b.settings);
  for(const day of new Set([...Object.keys(a.days||{}),...Object.keys(b.days||{})]))out.days[day]=[...new Set([...(a.days?.[day]||[]),...(b.days?.[day]||[])])];
  return out;
}
module.exports={mergeFlashcards};
