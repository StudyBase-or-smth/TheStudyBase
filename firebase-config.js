// Firebase client configuration from the standalone /api/firebaseConfig route.
// Public client identifiers are safe to ship; Admin credentials stay on the server.
// The public fallback supports offline startup for the existing Firebase project.

const PUBLIC_WEB_CONFIG = {
  apiKey: 'AIzaSyAZeyBIaTstTJ5Pr9o86MHk8dhDPAJFFCA',
  messagingSenderId: '434992387793',
  appId: '1:434992387793:web:e5bcae8cad63b4eb6f17f0',
};

const FALLBACK_WEB_CONFIG = {
  apiKey: PUBLIC_WEB_CONFIG.apiKey,
  authDomain: 'studybase-8cfa1.firebaseapp.com',
  projectId: 'studybase-8cfa1',
  storageBucket: 'studybase-8cfa1.firebasestorage.app',
  messagingSenderId: PUBLIC_WEB_CONFIG.messagingSenderId,
  appId: PUBLIC_WEB_CONFIG.appId,
};

let _load = null;

function firebaseConfigUrl() {
  if (typeof sbApiUrl === 'function') return sbApiUrl('/api/firebaseConfig');
  return '/api/firebaseConfig';
}

function fromProjectId(data) {
  const projectId = data && data.projectId;
  if (!projectId) return null;
  return {
    apiKey: PUBLIC_WEB_CONFIG.apiKey,
    authDomain: data.authDomain || (projectId + '.firebaseapp.com'),
    projectId,
    storageBucket: data.storageBucket || (projectId + '.firebasestorage.app'),
    messagingSenderId: PUBLIC_WEB_CONFIG.messagingSenderId,
    appId: PUBLIC_WEB_CONFIG.appId,
  };
}

export function loadFirebaseConfig() {
  if (_load) return _load;
  _load = fetch(firebaseConfigUrl())
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      const cfg = fromProjectId(data);
      if (!res.ok || !cfg) {
        throw new Error((data && data.error) || 'Firebase is not configured');
      }
      return cfg;
    })
    .catch(() => FALLBACK_WEB_CONFIG);
  return _load;
}
