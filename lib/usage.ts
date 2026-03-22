import { db } from './firebase'
import { doc, getDoc, setDoc, increment } from 'firebase/firestore'

const MONTHLY_LIMIT = Number(process.env.MONTHLY_QUESTION_LIMIT || 30)

export async function checkAndIncrementUsage(userId: string): Promise<{
  allowed: boolean
  used: number
  limit: number
}> {
  try {
    if (!db) return { allowed: true, used: 0, limit: MONTHLY_LIMIT }

    const now = new Date()
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const docRef = doc(db, 'usage', `${userId}_${yearMonth}`)

    const snap = await getDoc(docRef)
    const currentCount = snap.exists() ? (snap.data().count as number) : 0

    if (currentCount >= MONTHLY_LIMIT) {
      return { allowed: false, used: currentCount, limit: MONTHLY_LIMIT }
    }

    await setDoc(docRef, { count: increment(1), userId, yearMonth }, { merge: true })
    return { allowed: true, used: currentCount + 1, limit: MONTHLY_LIMIT }
  } catch {
    // Firebase 미설정 시 허용
    return { allowed: true, used: 0, limit: MONTHLY_LIMIT }
  }
}

export async function getUsageStatus(userId: string): Promise<{
  used: number
  limit: number
  remaining: number
}> {
  try {
    if (!db) return { used: 0, limit: MONTHLY_LIMIT, remaining: MONTHLY_LIMIT }

    const now = new Date()
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const docRef = doc(db, 'usage', `${userId}_${yearMonth}`)
    const snap = await getDoc(docRef)
    const used = snap.exists() ? (snap.data().count as number) : 0
    return { used, limit: MONTHLY_LIMIT, remaining: Math.max(0, MONTHLY_LIMIT - used) }
  } catch {
    return { used: 0, limit: MONTHLY_LIMIT, remaining: MONTHLY_LIMIT }
  }
}
