import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let db: Firestore | null = null

try {
  if (firebaseConfig.projectId) {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    db = getFirestore(app)
  }
} catch (e) {
  console.warn('Firebase 초기화 실패:', e)
}

export { db }
