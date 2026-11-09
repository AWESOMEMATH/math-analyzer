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
  // revalidatePath를 쓰면 화면이 다시 그려지며 업로드 결과 표시가 사라진다 — 새로고침은 화면 쪽에서 한다
  return out
}

// ── 시험지 문항 연결 ──────────────────────────
function parseRange(v: string): [number, number] | null {
  const m = v.replace(/\s/g, '').match(/^(\d{1,3})[-~](\d{1,3})$/)
  if (!m) return null
  const a = Number(m[1]), b = Number(m[2])
  return a >= 1 && b >= a && b - a < 60 ? [a, b] : null
}

export async function createExamMapAction(fd: FormData) {
  await requireAdmin()
  const { examKey, saveExamMap, getExamMap } = await import('@/lib/kakao/store')
  const { draftExamItems, blankItems } = await import('@/lib/exam/analyze')
  const { CLAUDE_MODEL } = await import('@/lib/claude')
  const title = String(fd.get('title') || '').trim()
  const range = parseRange(String(fd.get('range') || '1-22'))
  const mode = String(fd.get('mode') || 'ai')
  const file = fd.get('file')
  if (!title) redirect(`/admin/exams?error=${encodeURIComponent('패스드림 시험명을 고르세요')}`)
  if (!range) redirect(`/admin/exams?error=${encodeURIComponent('문항 범위는 1-22 처럼 쓰세요')}`)
  const id = examKey(title)
  const existing = await getExamMap(id)
  if (existing?.status === 'confirmed') redirect(`/admin/exams/${encodeURIComponent(id)}?error=${encodeURIComponent('이미 확정된 시험입니다. 고치려면 이 화면에서 수정하세요')}`)

  let items = blankItems(range[0], range[1])
  let model = 'manual'
  let note = ''
  const source = file instanceof File && file.size ? file.name : ''
  if (mode === 'ai') {
    if (!(file instanceof File) || !file.size) redirect(`/admin/exams?error=${encodeURIComponent('시험지 PDF를 올리세요')}`)
    if (file.size > 4 * 1024 * 1024) redirect(`/admin/exams?error=${encodeURIComponent('PDF가 4MB를 넘습니다 — 공통과목 쪽만 따로 저장해 올려 주세요')}`)
    try {
      items = await draftExamItems(Buffer.from(await file.arrayBuffer()).toString('base64'), range[0], range[1])
      model = CLAUDE_MODEL
    } catch (e) {
      console.error('시험지 분석 실패', e)
      const status = (e as { status?: number }).status
      const why = status === 401 ? 'API 키를 확인하세요' : status === 429 ? '요청이 많아 잠시 뒤 다시 시도하세요'
        : e instanceof Error ? e.message.slice(0, 80) : '오류'
      note = `AI 초안을 만들지 못해 빈 표로 시작합니다 — ${why}. 직접 고르거나 잠시 뒤 다시 올려 주세요`
    }
  }
  await saveExamMap({ id, title, items, status: 'draft', source, model, createdAt: Date.now(), confirmedAt: null })
  redirect(`/admin/exams/${encodeURIComponent(id)}${note ? `?error=${encodeURIComponent(note)}` : ''}`)
}

export async function saveExamMapAction(fd: FormData) {
  await requireAdmin()
  const { getExamMap, saveExamMap } = await import('@/lib/kakao/store')
  const { findTopic } = await import('@/lib/kakao/curriculum')
  const id = String(fd.get('id'))
  const m = await getExamMap(id)
  if (!m) redirect('/admin/exams')
  const items = m.items.map(it => {
    const code = String(fd.get(`code_${it.no}`) ?? it.topic_code)
    return {
      ...it,
      topic_code: findTopic(code) ? code : '',
      summary: String(fd.get(`summary_${it.no}`) ?? it.summary).slice(0, 80),
    }
  })
  const confirm = fd.get('intent') === 'confirm'
  const missing = items.filter(it => !it.topic_code).map(it => it.no)
  if (confirm && missing.length) {
    await saveExamMap({ ...m, items })
    redirect(`/admin/exams/${encodeURIComponent(id)}?error=${encodeURIComponent(`단원이 비어 있는 문항: ${missing.join(', ')}번`)}`)
  }
  await saveExamMap({ ...m, items, status: confirm ? 'confirmed' : 'draft', confirmedAt: confirm ? Date.now() : m.confirmedAt })
  revalidatePath('/admin/exams')
  redirect(`/admin/exams/${encodeURIComponent(id)}?saved=${confirm ? 'confirmed' : 'draft'}`)
}
