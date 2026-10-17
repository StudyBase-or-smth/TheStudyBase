// Public quiz startup never imports Firebase or checks account status.
// The backend still verifies permissions when its marking service is requested.
(function () {
  let pending;
  async function prepare() {
    if(window.__sbAuth?.currentUser) return window.__sbAuth.currentUser;
    if(sessionStorage.getItem('studybase_guest') === '1' || window.SB_LOCAL_JEV_RELAY) return null;
    if(!pending) pending = (async () => {
      const [app,authModule,config] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
        import('../firebase-config.js')
      ]);
      const instance = app.getApps().length ? app.getApp() : app.initializeApp(await config.loadFirebaseConfig());
      const auth = authModule.getAuth(instance); window.__sbAuth = auth;
      await auth.authStateReady();
      if(auth.currentUser) { window.currentUid = auth.currentUser.uid; window.isGuest = false; }
      return auth.currentUser;
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  window.StudyQuizAccount = { prepare };
})();
