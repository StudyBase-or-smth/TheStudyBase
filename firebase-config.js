// firebase-config.js
//
// Loads the public Firebase web config from /api/firebaseConfig so the
// project id (and related values) never have to live in page source.

let _load = null;

export function loadFirebaseConfig() {
  if (_load) return _load;
  _load = fetch('/api/firebaseConfig')
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.apiKey || !data.projectId) {
        throw new Error((data && data.error) || 'Firebase is not configured');
      }
      return {
        apiKey: data.apiKey,
        authDomain: data.authDomain,
        projectId: data.projectId,
        storageBucket: data.storageBucket,
        messagingSenderId: data.messagingSenderId,
        appId: data.appId,
      };
    })
    .catch(err => {
      _load = null;
      throw err;
    });
  return _load;
}
