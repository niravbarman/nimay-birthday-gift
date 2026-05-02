import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCctC3xneBeakbMZlp6j91dG9YZYPUJiB4",
  authDomain: "nimay-s-30th-birthday-gift.firebaseapp.com",
  databaseURL: "https://nimay-s-30th-birthday-gift-default-rtdb.firebaseio.com",
  projectId: "nimay-s-30th-birthday-gift",
  storageBucket: "nimay-s-30th-birthday-gift.firebasestorage.app",
  messagingSenderId: "388522877480",
  appId: "1:388522877480:web:f9eee9b71e1217e6088b1d",
  measurementId: "G-7874189RE1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export const signInAnon = () => signInAnonymously(auth);
