// firebase-config.js
//
// Loads FIREBASE_PROJECT_ID at runtime from /api/firebaseConfig so that
// value is not committed (Netlify secrets scanning). The web API key,
// app id, and sender id are public Firebase client identifiers — they
// are not Admin SDK secrets — and live here so sign-in works without
// extra Netlify env vars.

const PUBLIC_WEB_CONFIG = {
  apiKey: 'AIzaSyAZeyBIaTstTJ5Pr9o86MHk8dhDPAJFFCA',
  messagingSenderId: '434992387793',
  appId: '1:434992387793:web:e5bcae8cad63b4eb6f17f0',
};

let _load = null;

export function loadFirebaseConfig() {
  if (_load) return _load;
  _load = fetch('/api/firebaseConfig')
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.projectId) {
        throw new Error((data && data.error) || 'Firebase is not configured');
      }
      return {
        apiKey: data.apiKey || PUBLIC_WEB_CONFIG.apiKey,
        authDomain: data.authDomain || (data.projectId + '.firebaseapp.com'),
        projectId: data.projectId,
        storageBucket: data.storageBucket || (data.projectId + '.firebasestorage.app'),
        messagingSenderId: data.messagingSenderId || PUBLIC_WEB_CONFIG.messagingSenderId,
        appId: data.appId || PUBLIC_WEB_CONFIG.appId,
      };
    })
    .catch(err => {
      _load = null;
      throw err;
    });
  return _load;
}
