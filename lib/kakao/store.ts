import { randomBytes } from 'crypto'
import { getAdminDb } from '@/lib/firebaseAdmin'
import type { DiagnosisReport, NoteData, PendingQuestion, QuestionRecord } from './types'

const Q = 'kakao_questions'
const U = 'kakao_users'
const R = 'kakao_reports'

export const CYCLE_MS = 28 * 24 * 60 * 60 * 1000

/** 노트·진단표 링크는 로그인 없이 열리므로 추측 불가능한 ID를 쓴다 */
export function newId(): string {
  return randomBytes(16).toString('base64url')
}

export interface KakaoUser {
  userKey: string
  cycleStart: number
  createdAt: number
  pendingReportId?: string | null
  lastReportId?: string | null
}

export async function getOrCreateUser(userKey: string): Promise<KakaoUser> {
  const ref = getAdminDb().collection(U).doc(userKey)
  const snap = await ref.get()
  if (snap.exists) return snap.data() as KakaoUser
  const now = Date.now()
  const u: KakaoUser = { userKey, cycleStart: now, createdAt: now, pendingReportId: null, lastReportId: null }
  await ref.set(u)
  return u
}

export async function updateUser(userKey: string, patch: Partial<KakaoUser>) {
  await getAdminDb().collection(U).doc(userKey).set(patch, { merge: true })
}

/** 노트 링크를 미리 보낼 수 있도록 작성 중 상태로 먼저 만든다 */
export async function createPendingQuestion(userKey: string): Promise<PendingQuestion> {
  const p: PendingQuestion = { id: newId(), userKey, createdAt: Date.now(), status: 'pending' }
  await getAdminDb().collection(Q).doc(p.id).set(p)
  return p
}

export async function completeQuestion(p: PendingQuestion, note: NoteData, model: string, brainUsed: boolean) {
  const rec: QuestionRecord = { id: p.id, userKey: p.userKey, createdAt: p.createdAt, status: 'done', note, model, brainUsed }
  await getAdminDb().collection(Q).doc(rec.id).set(rec)
  return rec
}

export async function failQuestion(id: string) {
  await getAdminDb().collection(Q).doc(id).set({ status: 'failed' }, { merge: true })
}

export async function getQuestion(id: string): Promise<QuestionRecord | PendingQuestion | null> {
  const snap = await getAdminDb().collection(Q).doc(id).get()
  return snap.exists ? (snap.data() as QuestionRecord | PendingQuestion) : null
}

export function isDone(q: QuestionRecord | PendingQuestion | null): q is QuestionRecord {
  return !!q && 'note' in q && !!q.note
}

export async function listQuestions(userKey: string, from: number, to: number): Promise<QuestionRecord[]> {
  // (userKey, createdAt) 복합 색인 필요 — docs/KAKAO_SETUP.md 참고
  const snap = await getAdminDb()
    .collection(Q)
    .where('userKey', '==', userKey)
    .where('createdAt', '>=', from)
    .where('createdAt', '<', to)
    .orderBy('createdAt', 'asc')
    .get()
  // 작성 중·실패 문서는 진단 집계에서 뺀다
  return snap.docs.map(d => d.data() as QuestionRecord).filter(q => !!q.note)
}

export async function saveReport(report: DiagnosisReport) {
  await getAdminDb().collection(R).doc(report.id).set(report)
}

export async function getReport(id: string): Promise<DiagnosisReport | null> {
  const snap = await getAdminDb().collection(R).doc(id).get()
  return snap.exists ? (snap.data() as DiagnosisReport) : null
}

/** 4주 주기가 끝난 사용자 (크론용) */
export async function listDueUsers(now = Date.now()): Promise<KakaoUser[]> {
  const snap = await getAdminDb().collection(U).where('cycleStart', '<=', now - CYCLE_MS).get()
  return snap.docs.map(d => d.data() as KakaoUser)
}
