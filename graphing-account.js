// Optional account integration: public snapshots and local graphs do not require login.
function showLocalAccount(message) {
  window.isGuest = true;
  window.currentUid = '';
  window.userRole = '';
  window.sbAccount = { name: 'Guest', email: '', role: 'guest' };
  window.sbProfile = {};
  const tip = document.getElementById('hdrProfileTip');
  // Preserve shared QoL links and notifications when changing account state.
  tip.querySelector('.pt-name').textContent = 'Guest';
  tip.querySelector('.pt-signout')?.remove();
  tip.querySelector('.pt-email')?.remove();
  tip.querySelector('.pt-role')?.remove();
  document.querySelector('.hdr-profile-face').textContent = '👤';
  let status = document.getElementById('graphingAccountStatus');
  if (!status) { status = document.createElement('p'); status.id = 'graphingAccountStatus'; status.className = 'qol-muted'; tip.prepend(status); }
  status.textContent = message;
  if (!tip.querySelector('.graphing-signin')) {
    const link = document.createElement('a'); link.className = 'qol-view-profile graphing-signin'; link.href = 'login.html'; link.textContent = 'Sign in'; tip.append(link);
  }
  window.SBQoL?.applyPreferences();
}

try {
  const [{ initializeApp }, { getAuth, onAuthStateChanged, signOut }, { loadFirebaseConfig }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
    import('./firebase-config.js')
  ]);
  const auth = getAuth(initializeApp(await loadFirebaseConfig()));
  window.__sbAuth = auth;
  window.sbSignOut = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('studybase_guest');
      location.href = 'login.html';
    } catch { document.getElementById('graphingStatus').textContent = 'Could not sign out. Please try again.'; }
  };
  onAuthStateChanged(auth, async user => {
    if (!user) { showLocalAccount('Your graphs are saved on this device.'); return; }
    try {
      const { claims } = await user.getIdTokenResult(true);
      if (auth.currentUser !== user) return;
      if (claims.status !== 'active') { showLocalAccount('Account access is pending. Local graphing is still available.'); return; }
      sessionStorage.removeItem('studybase_guest');
      window.isGuest = false;
      window.userRole = claims.role || 'student';
      window.bootHdrProfile(user, window.userRole);
      window.SBQoL?.applyPreferences();
      window.sbNotifyRefresh?.();
    } catch { showLocalAccount('Account unavailable. Local graphing is still available.'); }
  });
} catch {
  showLocalAccount('Account unavailable. Local graphing is still available.');
}
