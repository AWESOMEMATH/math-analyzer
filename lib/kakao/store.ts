import { randomBytes, randomInt } from 'crypto'
import { getAdminDb } from '@/lib/firebaseAdmin'
import type { Academy, DiagnosisReport, NoteData, PendingQuestion, QuestionRecord, Student } from './types'

const Q = 'kakao_questions'
const U = 'kakao_users'      // 카카오 계정 → 학생 연결표
const R = 'kakao_reports'
const S = 'students'
const A = 'academies'

export const CYCLE_MS = 28 * 24 * 60 * 60 * 1000

/** 노트·진단표 링크는 로그인 없이 열리므로 추측 불가능한 ID를 쓴다 */
export function newId(): string {
  return randomBytes(16).toString('base64url')
}

const db = () => getAdminDb()

// ── 학원 ──────────────────────────────────────
export async function createAcademy(name: string): Promise<Academy> {
  const a: Academy = { id: newId(), name: name.trim(), createdAt: Date.now() }
  await db().collection(A).doc(a.id).set(a)
  return a
}

export async function listAcademies(): Promise<Academy[]> {
  const snap = await db().collection(A).orderBy('name').get()
  return snap.docs.map(d => d.data() as Academy)
}

// ── 연결 코드 ─────────────────────────────────
// 헷갈리는 글자(0/O, 1/I/L)를 뺀 32자 × 4자리 ≈ 100만 가지
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_PATTERN = /^AW-?([2-9A-HJKMNP-Z]{4})$/i

export function normalizeCode(input: string): string | null {
  const m = input.trim().toUpperCase().replace(/\s/g, '').match(CODE_PATTERN)
  return m ? `AW-${m[1]}` : null
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = 'AW-' + Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')
    const dup = await db().collection(S).where('linkCode', '==', code).limit(1).get()
    if (dup.empty) return code
  }
  throw new Error('연결 코드 생성 실패')
}

// ── 학생 ──────────────────────────────────────
export type NewStudent = Pick<Student, 'name' | 'status' | 'grade' | 'school' | 'academyId' | 'targetYear' | 'memo'>

export async function createStudent(input: NewStudent): Promise<Student> {
  const st: Student = {
    ...input,
    id: newId(),
    active: true,
    createdAt: Date.now(),
    linkCode: await uniqueCode(),
    kakaoUserKey: null,
    consentAt: null,
    cycleStart: null,
    pendingReportId: null,
    lastReportId: null,
  }
  await db().collection(S).doc(st.id).set(st)
  return st
}

export async function getStudent(id: string): Promise<Student | null> {
  const snap = await db().collection(S).doc(id).get()
  return snap.exists ? (snap.data() as Student) : null
}

export async function listStudents(academyId?: string): Promise<Student[]> {
  let q: FirebaseFirestore.Query = db().collection(S)
  if (academyId) q = q.where('academyId', '==', academyId)
  const snap = await q.get()
  return snap.docs.map(d => d.data() as Student).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export async function updateStudent(id: string, patch: Partial<Student>) {
  await db().collection(S).doc(id).set(patch, { merge: true })
}

/** 휴대폰 교체 등으로 다시 연결해야 할 때 — 기존 카카오 연결은 끊는다 */
export async function reissueCode(id: string): Promise<string> {
  const st = await getStudent(id)
  if (!st) throw new Error('학생 없음')
  if (st.kakaoUserKey) await db().collection(U).doc(st.kakaoUserKey).set({ studentId: null }, { merge: true })
  const code = await uniqueCode()
  await updateStudent(id, { linkCode: code, kakaoUserKey: null })
  return code
}

export async function findStudentByCode(code: string): Promise<Student | null> {
  const snap = await db().collection(S).where('linkCode', '==', code).limit(1).get()
  const st = snap.empty ? null : (snap.docs[0].data() as Student)
  return st && st.active ? st : null
}

// ── 카카오 계정 ↔ 학생 연결 ───────────────────
export interface KakaoLink {
  userKey: string
  studentId: string | null
  pendingStudentId: string | null   // 코드를 보냈고 동의를 기다리는 중
  pendingCode: string | null
  createdAt: number
}

export async function getLink(userKey: string): Promise<KakaoLink> {
  const snap = await db().collection(U).doc(userKey).get()
  if (snap.exists) {
    const d = snap.data() as Partial<KakaoLink>
    return { userKey, studentId: d.studentId ?? null, pendingStudentId: d.pendingStudentId ?? null, pendingCode: d.pendingCode ?? null, createdAt: d.createdAt ?? Date.now() }
  }
  return { userKey, studentId: null, pendingStudentId: null, pendingCode: null, createdAt: Date.now() }
}

export async function setPendingLink(userKey: string, studentId: string | null, code: string | null) {
  await db().collection(U).doc(userKey).set({ userKey, pendingStudentId: studentId, pendingCode: code, createdAt: Date.now() }, { merge: true })
}

/** 동의 후 연결 확정. 코드는 1회용이라 지운다. 코드가 그사이 재발급됐으면 실패한다. */
export async function confirmLink(userKey: string, studentId: string, code: string): Promise<Student | null> {
  const sref = db().collection(S).doc(studentId)
  const uref = db().collection(U).doc(userKey)
  return db().runTransaction(async tx => {
    const snap = await tx.get(sref)
    if (!snap.exists) return null
    const st = snap.data() as Student
    if (!st.active || !st.linkCode || st.linkCode !== code) return null
    if (st.kakaoUserKey && st.kakaoUserKey !== userKey) {
      tx.set(db().collection(U).doc(st.kakaoUserKey), { studentId: null }, { merge: true })
    }
    const now = Date.now()
    tx.set(sref, { linkCode: null, kakaoUserKey: userKey, consentAt: now }, { merge: true })
    tx.set(uref, { userKey, studentId, pendingStudentId: null, pendingCode: null, createdAt: now }, { merge: true })
    return { ...st, linkCode: null, kakaoUserKey: userKey, consentAt: now }
  })
}

// ── 질문 ──────────────────────────────────────
/** 노트 링크를 미리 보낼 수 있도록 작성 중 상태로 먼저 만든다 */
export async function createPendingQuestion(st: Pick<Student, 'id'>, userKey: string): Promise<PendingQuestion> {
  const p: PendingQuestion = { id: newId(), studentId: st.id, userKey, createdAt: Date.now(), status: 'pending' }
  await db().collection(Q).doc(p.id).set(p)
  return p
}

export async function completeQuestion(p: PendingQuestion, note: NoteData, model: string, brainUsed: boolean) {
  const rec: QuestionRecord = {
    id: p.id, studentId: p.studentId, userKey: p.userKey, createdAt: p.createdAt,
    status: 'done', note, model, brainUsed,
  }
  await db().collection(Q).doc(rec.id).set(rec)
  // 첫 완성 질문 시각부터 4주 진단 주기를 센다 (실패한 시도는 세지 않는다)
  const st = await getStudent(p.studentId)
  if (st && !st.cycleStart) await updateStudent(st.id, { cycleStart: p.createdAt })
  return rec
}

export async function failQuestion(id: string) {
  await db().collection(Q).doc(id).set({ status: 'failed' }, { merge: true })
}

export async function getQuestion(id: string): Promise<QuestionRecord | PendingQuestion | null> {
  const snap = await db().collection(Q).doc(id).get()
  return snap.exists ? (snap.data() as QuestionRecord | PendingQuestion) : null
}

export function isDone(q: QuestionRecord | PendingQuestion | null): q is QuestionRecord {
  return !!q && 'note' in q && !!q.note
}

export async function listQuestions(studentId: string, from: number, to: number): Promise<QuestionRecord[]> {
  // (studentId, createdAt) 복합 색인 필요 — docs/KAKAO_SETUP.md 참고
  const snap = await db()
    .collection(Q)
    .where('studentId', '==', studentId)
    .where('createdAt', '>=', from)
    .where('createdAt', '<', to)
    .orderBy('createdAt', 'asc')
    .get()
  // 작성 중·실패 문서는 진단 집계에서 뺀다
  return snap.docs.map(d => d.data() as QuestionRecord).filter(q => !!q.note)
}

export async function countQuestions(studentId: string): Promise<number> {
  const snap = await db().collection(Q).where('studentId', '==', studentId).where('status', '==', 'done').count().get()
  return snap.data().count
}

// ── 진단표 ────────────────────────────────────
export async function saveReport(report: DiagnosisReport) {
  await db().collection(R).doc(report.id).set(report)
}

export async function getReport(id: string): Promise<DiagnosisReport | null> {
  const snap = await db().collection(R).doc(id).get()
  return snap.exists ? (snap.data() as DiagnosisReport) : null
}

/** 4주 주기가 끝난 학생 (크론용) */
export async function listDueStudents(now = Date.now()): Promise<Student[]> {
  const snap = await db().collection(S).where('cycleStart', '<=', now - CYCLE_MS).get()
  return snap.docs.map(d => d.data() as Student).filter(s => s.active)
}
