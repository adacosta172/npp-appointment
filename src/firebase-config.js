// Public Firebase Web App identifiers. These are not administrator credentials.
// Firestore and Storage access is restricted by server-side authorization and rules.
export const firebaseWebConfig = Object.freeze({
  apiKey: 'AIzaSyCtBUoncDFASH2YSAET477gIN6saiqFHCE',
  authDomain: 'nppappointment.firebaseapp.com',
  projectId: 'nppappointment',
  databaseURL: 'https://nppappointment-default-rtdb.firebaseio.com',
  storageBucket: 'nppappointment.firebasestorage.app',
  messagingSenderId: '360671629660',
  appId: '1:360671629660:web:73f00b87c8db66b94af199',
  measurementId: 'G-KHYXE28VXV'
});

export function resolveFirebaseConfig(env = {}) {
  // Never inherit production configuration when local emulator mode is requested.
  const base = env.VITE_EMULATOR === 'true' ? {
    apiKey: 'demo-api-key',
    authDomain: 'demo-nppappointment.firebaseapp.com',
    projectId: 'demo-nppappointment',
    databaseURL: 'https://demo-nppappointment-default-rtdb.firebaseio.com',
    storageBucket: 'demo-nppappointment.appspot.com',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:0000000000000000000000'
  } : firebaseWebConfig;
  const keys = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    databaseURL: 'VITE_FIREBASE_DATABASE_URL',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID'
  };
  const config = {};
  for (const [field, variable] of Object.entries(keys)) {
    config[field] = env[variable]?.trim() || base[field];
  }
  return config;
}
// Analytics is intentionally not initialized. No tracking is enabled by measurementId.
