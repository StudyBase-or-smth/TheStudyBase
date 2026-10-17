const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('quiz-tool/quiz-account.js','utf8');
test('opening the quiz does not import account services or redirect to login/status pages',()=>{
  let imports=0;
  const context=vm.createContext({sessionStorage:{getItem:()=>null},testImport(){imports++;throw Error('offline');}});context.window=context;
  vm.runInContext(source.replaceAll('import(','testImport('),context);assert.equal(imports,0);
  const html=fs.readFileSync('quiz-tool/quiz-tool.html','utf8');
  assert.doesNotMatch(html,/getIdTokenResult\(true\)|waiting\.html/);
  assert.doesNotMatch(html,/<script type="module">/);
});
test('site marking loads account services only on demand and never forces a client status check',async()=>{
  let imports=0,ready=0;const user={uid:'student'},auth={currentUser:user,async authStateReady(){ready++;}};
  const context=vm.createContext({sessionStorage:{getItem:()=>null},async testImport(url){imports++;if(url.includes('firebase-app'))return {getApps:()=>[{}],getApp:()=>({})};if(url.includes('firebase-auth'))return {getAuth:()=>auth};return {};}});context.window=context;
  vm.runInContext(source.replaceAll('import(','testImport('),context);
  assert.equal(await context.StudyQuizAccount.prepare(),user);assert.equal(imports,3);assert.equal(ready,1);
  assert.equal(await context.StudyQuizAccount.prepare(),user);assert.equal(imports,3);
});
test('local and guest quiz sessions do not load Firebase even when account preparation is requested',async()=>{
  let imports=0;const context=vm.createContext({sessionStorage:{getItem:()=> '1'},testImport(){imports++;}});context.window=context;
  vm.runInContext(source.replaceAll('import(','testImport('),context);
  assert.equal(await context.StudyQuizAccount.prepare(),null);assert.equal(imports,0);
});
