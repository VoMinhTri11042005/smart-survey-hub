/**
 * Firebase Configuration & Authentication Service
 * Cung cấp Google Sign-In cho Smart Survey Hub.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD2OuyZwR1ecaaBk31J83T2j-Qu_eMk1ow",
  authDomain: "smart-survey-hub.firebaseapp.com",
  projectId: "smart-survey-hub",
  storageBucket: "smart-survey-hub.firebasestorage.app",
  messagingSenderId: "386265874475",
  appId: "1:386265874475:web:284d4bc22a4a93d82fea6e",
  databaseURL: "https://smart-survey-hub-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export { auth, db };
export type { User };
