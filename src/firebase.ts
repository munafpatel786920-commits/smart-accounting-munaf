import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: "AIzaSyDBq9wGAqJUz-WP-_99RyCpdllwIwCs07U",
  authDomain: "apt-memento-485612-d6.firebaseapp.com",
  projectId: "apt-memento-485612-d6",
  storageBucket: "apt-memento-485612-d6.firebasestorage.app",
  messagingSenderId: "756714871266",
  appId: "1:756714871266:web:0c24ab7494875c0b3601bb",
  measurementId: "G-VY92E4EFXC"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with auto-detect long polling for optimal connection stability
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  }
);

export const auth = getAuth(app);

export let analytics: any = null;
if (firebaseConfig.measurementId) {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}


