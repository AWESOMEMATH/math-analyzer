// 서버 전용 Firestore (Admin SDK).
// 학생 질문·진단 데이터는 개인정보이므로 클라이언트 SDK(규칙 if true)로 쓰지 않는다.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

let adminDb: Firestore | null = null

export function getAdminDb(): Firestore {
  if (adminDb) return adminDb
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 없습니다 (서비스 계정 JSON 전체).')
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(JSON.parse(raw)) })
  adminDb = getFirestore(app)
  return adminDb
}
