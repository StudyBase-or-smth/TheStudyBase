// Wrap the unmodified npm CommonJS distribution for this script-based site.
const fs=require('node:fs'),path=require('node:path');
const entry=require.resolve('perfect-freehand'),root=path.resolve(__dirname,'..'),pkg=path.resolve(path.dirname(entry),'../..'),out=path.join(root,'vendor/perfect-freehand');
fs.mkdirSync(out,{recursive:true});
const licence=fs.readFileSync(path.join(pkg,'LICENSE'),'utf8');
fs.writeFileSync(path.join(out,'perfect-freehand.js'),'/*! perfect-freehand 1.2.3 — MIT. See LICENSES.txt in this directory. */\n(function(root){const exports={};\n'+fs.readFileSync(entry,'utf8').replace(/\/\/# sourceMappingURL=.*$/m,'')+'\nroot.PerfectFreehand=exports;\n})(window);\n');
fs.writeFileSync(path.join(out,'LICENSES.txt'),licence);
