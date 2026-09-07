import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { setTokenProvider } from './api';
export function configured() {
  return !!import.meta.env.VITE_FIREBASE_API_KEY && !!import.meta.env.VITE_FIREBASE_PROJECT_ID;
}
function auth() {
  const app =
    getApps()[0] ||
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
  return getAuth(app);
}
export function observeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth(), (user) => {
    setTokenProvider(async () => (user ? user.getIdToken() : ''));
    callback(user);
  });
}
export async function login() {
  await signInWithPopup(auth(), new GoogleAuthProvider());
}
export async function logout() {
  await signOut(auth());
}
