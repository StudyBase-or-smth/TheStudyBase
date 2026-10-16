// Copy the requested MIT npm distribution verbatim; no Anki source is used.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),pkg=path.dirname(require.resolve('ts-fsrs'));
fs.mkdirSync(path.join(root,'vendor/ts-fsrs'),{recursive:true});
for(const [source,target] of [[path.join(pkg,'index.umd.js'),'index.umd.js'],[path.join(pkg,'../LICENSE'),'LICENSE']])fs.copyFileSync(source,path.join(root,'vendor/ts-fsrs',target));
