'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { login, logout, requireAdmin } from '@/lib/admin'
import { createAcademy, createStudent, getStudent, reissueCode, updateStudent, type NewStudent } from '@/lib/kakao/store'
import { defaultTargetYear } from '@/lib/kakao/exam'
import type { StudentStatus } from '@/lib/kakao/types'

export async function loginAction(fd: FormData) {
  const ok = await login(String(fd.get('password') || ''))
  redirect(ok ? '/admin' : '/admin?error=login')
}

export async function logoutAction() {
  await logout()
  redirect('/admin')
}

export async function addAcademyAction(fd: FormData) {
  await requireAdmin()
  const name = String(fd.get('name') || '').trim()
  if (name) await createAcademy(name)
  revalidatePath('/admin')
}

function parseStatus(v: string): StudentStatus | null {
  const t = v.replace(/\s/g, '')
  if (/^(재학|재학생|enrolled)$/i.test(t)) return 'enrolled'
  if (/^(N수|N수생|재수|재수생|반수|삼수|repeat)$/i.test(t)) return 'repeat'
  return null
}

/** 학교 이름 표기 통일: "OO고등학교", "OO고교" → "OO고" */
function normalizeSchool(v: string): string {
  return v.trim().replace(/\s+/g, '').replace(/(고등학교|고교)$/, '고')
}

function buildStudent(f: {
  name: string; status: string; grade: string; school: string; targetYear: string; memo: string; academyId: string
}): NewStudent | string {
  const name = f.name.trim()
  if (!name) return '이름이 비어 있습니다'
  const status = parseStatus(f.status)
  if (!status) return `구분을 알 수 없습니다 (${f.status}) — 재학 또는 N수`
  let grade: 1 | 2 | 3 | null = null
  if (status === 'enrolled') {
    const g = Number(f.grade.replace(/[^0-9]/g, ''))
    if (![1, 2, 3].includes(g)) return `학년은 1~3이어야 합니다 (${f.grade})`
    grade = g as 1 | 2 | 3
  }
  const ty = f.targetYear.trim() ? Number(f.targetYear) : defaultTargetYear(status, grade)
  if (!Number.isInteger(ty) || ty < 2026 || ty > 2035) return `목표 수능 학년도가 올바르지 않습니다 (${f.targetYear})`
  if (!f.academyId) return '학원을 선택하세요'
  return { name, status, grade, school: normalizeSchool(f.school), academyId: f.academyId, targetYear: ty, memo: f.memo.trim() }
}

export async function addStudentAction(fd: FormData) {
  await requireAdmin()
  const r = buildStudent({
    name: String(fd.get('name') || ''), status: String(fd.get('status') || ''), grade: String(fd.get('grade') || ''),
    school: String(fd.get('school') || ''), targetYear: String(fd.get('targetYear') || ''),
    memo: String(fd.get('memo') || ''), academyId: String(fd.get('academyId') || ''),
  })
  if (typeof r === 'string') redirect(`/admin?error=${encodeURIComponent(r)}`)
  await createStudent(r)
  revalidatePath('/admin')
  redirect(`/admin?academy=${r.academyId}`)
}

/** 엑셀에서 복사해 붙여넣기: 이름, 구분, 학년, 학교, 목표학년도(선택), 메모(선택) — 탭 또는 쉼표 구분 */
export async function bulkAddAction(fd: FormData) {
  await requireAdmin()
  const academyId = String(fd.get('academyId') || '')
  const lines = String(fd.get('rows') || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const errors: string[] = []
  const ok: NewStudent[] = []
  lines.forEach((line, i) => {
    const c = line.split(/\t|,/).map(x => x.trim())
    if (i === 0 && c[0] === '이름') return // 머리글 줄
    const r = buildStudent({
      name: c[0] ?? '', status: c[1] ?? '', grade: c[2] ?? '', school: c[3] ?? '',
      targetYear: c[4] ?? '', memo: c[5] ?? '', academyId,
    })
    if (typeof r === 'string') errors.push(`${i + 1}행 ${c[0] ?? ''}: ${r}`)
    else ok.push(r)
  })
  // 한 줄이라도 틀리면 아무것도 등록하지 않는다 (절반만 들어가는 것을 막기 위해)
  if (errors.length) redirect(`/admin?academy=${academyId}&error=${encodeURIComponent(errors.slice(0, 5).join(' / '))}`)
  for (const s of ok) await createStudent(s)
  revalidatePath('/admin')
  redirect(`/admin?academy=${academyId}&added=${ok.length}`)
}

export async function reissueCodeAction(fd: FormData) {
  await requireAdmin()
  const id = String(fd.get('id'))
  await reissueCode(id)
  revalidatePath('/admin')
}

export async function toggleActiveAction(fd: FormData) {
  await requireAdmin()
  const id = String(fd.get('id'))
  const st = await getStudent(id)
  if (st) await updateStudent(id, { active: !st.active })
  revalidatePath('/admin')
}

// ── 패스드림 성적분석 리포트 PDF 가져오기 ──────────────
export interface ImportSummary {
  error?: string
  saved: { name: string; title: string; score: string }[]
  duplicate: string[]
  unmatched: string[]     // 이 학원 명부에 없는 이름
  ambiguous: string[]     // 동명이인
  warnings: string[]
}

/** lines: 브라우저에서 PDF에서 뽑은 글자 줄 (lib/passdream/extract.ts) */
export async function importPassdreamAction(academyId: string, lines: string[]): Promise<ImportSummary> {
  await requireAdmin()
  const { parseReport } = await import('@/lib/passdream/parse')
  const { listStudents, saveTestResult, testResultId, updateStudent } = await import('@/lib/kakao/store')
  const out: ImportSummary = { saved: [], duplicate: [], unmatched: [], ambiguous: [], warnings: [] }
  if (!academyId) return { ...out, error: '학원을 선택하세요' }
  if (!Array.isArray(lines) || lines.length > 50000) return { ...out, error: '파일 내용을 읽지 못했습니다' }

  const results = parseReport(lines.map(l => String(l).slice(0, 2000)))
  if (!results.length) return { ...out, error: '패스드림 「과제 성적분석 리포트」 PDF가 아닌 것 같습니다' }

  const students = (await listStudents(academyId)).filter(s => s.active)
  const now = Date.now()
  for (const r of results) {
    const who = students.filter(s => s.name.replace(/\s/g, '') === r.studentName)
    if (who.length === 0) { out.unmatched.push(r.studentName); continue }
    if (who.length > 1) { out.ambiguous.push(r.studentName); continue }
    const st = who[0]
    r.warnings.forEach(w => out.warnings.push(`${r.studentName}: ${w}`))
    const takenAt = r.submittedAt ? new Date(`${r.submittedAt}T00:00:00+09:00`).getTime() : now
    const saved = await saveTestResult({
      id: testResultId(st.id, r.title, r.submittedAt),
      studentId: st.id, academyId, source: 'passdream',
      title: r.title, course: r.course, submittedAt: r.submittedAt, takenAt,
      totalItems: r.totalItems, correct: r.correct, rank: r.rank, classSize: r.classSize,
      units: r.units, wrongItems: r.wrongItems, wrongComplete: r.wrongComplete, importedAt: now,
    })
    if (!saved) { out.duplicate.push(`${r.studentName} (${r.title})`); continue }
    // 질문이 아직 없어도 테스트가 들어오면 4주 진단 주기를 시작한다
    if (!st.cycleStart) await updateStudent(st.id, { cycleStart: now })
    out.saved.push({ name: r.studentName, title: r.title, score: `${r.correct}/${r.totalItems}` })
  }
  revalidatePath('/admin')
  return out
}
