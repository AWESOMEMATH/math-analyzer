import Anthropic from '@anthropic-ai/sdk'
import { findTopic, loadTopics } from './curriculum'
import { ANSWER_MODEL } from './answer'
import { CYCLE_MS, getOrCreateUser, listQuestions, newId, saveReport, updateUser } from './store'
import { ERROR_TYPE_LABEL, type DiagnosisReport, type ErrorType, type QuestionRecord, type TopicStat } from './types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** 이보다 적으면 진단표를 만들지 않는다 — 몇 문항으로 "취약 단원"을 단정하면 오진이 된다 */
export const MIN_QUESTIONS = Number(process.env.DIAG_MIN_QUESTIONS || 8)

export function aggregate(qs: QuestionRecord[]) {
  const map = new Map<string, TopicStat>()
  const errorTotals: Partial<Record<ErrorType, number>> = {}
  for (const q of qs) {
    const n = q.note
    if (!n.legible) continue
    const code = n.topic_code || 'unmapped'
    const t = findTopic(code)
    const st = map.get(code) ?? {
      code,
      label: t ? `${t.course} > ${t.chapter} > ${t.topic}` : '단원 미분류',
      asked: 0, withWork: 0, wrong: 0, errors: {},
    }
    st.asked++
    if (n.has_student_work) {
      st.withWork++
      if (n.student_verdict === 'wrong') st.wrong++
      st.errors[n.error_type] = (st.errors[n.error_type] ?? 0) + 1
      errorTotals[n.error_type] = (errorTotals[n.error_type] ?? 0) + 1
    }
    map.set(code, st)
  }
  // 교육과정 순서대로 정렬 (진단표가 단원 흐름으로 읽히도록)
  const order = new Map(loadTopics().map(t => [t.code, t.order]))
  const stats = [...map.values()].sort((a, b) => (order.get(a.code) ?? 1e9) - (order.get(b.code) ?? 1e9))
  return { stats, errorTotals }
}

function buildCaveats(qs: QuestionRecord[], stats: TopicStat[]): string[] {
  const c: string[] = []
  const withWork = qs.filter(q => q.note.has_student_work).length
  if (withWork < qs.length / 2) {
    c.push(`풀이 없이 문제만 보낸 질문이 ${qs.length - withWork}건입니다. 이 질문들은 "어려워한 단원"의 근거일 뿐, 어떤 오류인지는 판단하지 못했습니다. 다음 4주는 자기 풀이를 함께 찍어 보내면 진단이 정확해집니다.`)
  }
  const low = qs.filter(q => q.note.topic_confidence === 'low').length
  if (low) c.push(`단원 분류가 불확실한 문항 ${low}건이 포함되어 있습니다.`)
  if (stats.some(s => s.code === 'unmapped')) c.push('교육과정 단원에 대응하지 못한 문항이 있습니다.')
  c.push('질문하지 않은 단원은 "잘한다"는 뜻이 아니라 "자료가 없다"는 뜻입니다.')
  return c
}

const SOLUTION_SYSTEM = `너는 27년 경력 수학 교사 어썸 정현경이다. 학생 한 명이 4주 동안 카카오톡으로 보낸 질문 집계를 보고 2022 개정 교육과정 기준 처방을 쓴다.
규칙
- 집계에 근거가 있는 말만 한다. 질문 수가 적은 단원을 단정하지 않는다.
- priorities는 최대 3개. code는 집계에 나온 토픽 코드만 쓴다.
- prerequisites에는 우선 단원을 풀기 위해 먼저 점검해야 할 이전 학년·이전 단원을 교육과정 순서에 맞게 적는다.
- weekly_plan은 4주. 각 주 tasks는 2~3개, 학생이 바로 실행할 수 있는 행동(문항 수·방법)으로 쓴다.
- 합니다체. 비유 금지. 라벨 뒤 콜론 금지.
다른 말 없이 JSON 하나만 출력한다.
{"headline":"한 문장 총평","priorities":[{"code":"","label":"","reason":"","action":""}],"prerequisites":[""],"weekly_plan":[{"week":1,"focus":"","tasks":[""]}],"habit":"풀이 습관 한 가지"}`

async function generateSolution(stats: TopicStat[], errorTotals: Partial<Record<ErrorType, number>>, qs: QuestionRecord[]) {
  const topicInfo = stats
    .filter(s => s.code !== 'unmapped')
    .map(s => {
      const t = findTopic(s.code)!
      return {
        code: s.code, label: s.label, asked: s.asked, with_work: s.withWork, wrong: s.wrong,
        errors: Object.fromEntries(Object.entries(s.errors).map(([k, v]) => [ERROR_TYPE_LABEL[k as ErrorType], v])),
        curriculum_common_errors: t.commonErrors,
        key_concepts: t.keyConcepts,
      }
    })
  const feedbacks = qs
    .filter(q => q.note.student_verdict === 'wrong' && q.note.student_feedback)
    .slice(-12)
    .map(q => `[${q.note.topic_code}] ${q.note.student_feedback}`)

  const res = await anthropic.messages.create({
    model: ANSWER_MODEL,
    max_tokens: 3000,
    system: SOLUTION_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        total_questions: qs.length,
        error_totals: Object.fromEntries(Object.entries(errorTotals).map(([k, v]) => [ERROR_TYPE_LABEL[k as ErrorType], v])),
        topics: topicInfo,
        recent_wrong_feedback: feedbacks,
      }),
    }],
  })
  const text = res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('진단 처방 파싱 실패')
  const j = JSON.parse(m[0]) as DiagnosisReport['solution']
  const valid = new Set(stats.map(s => s.code))
  return {
    headline: j.headline ?? '',
    priorities: (j.priorities ?? []).filter(p => valid.has(p.code)).slice(0, 3),
    prerequisites: j.prerequisites ?? [],
    weekly_plan: (j.weekly_plan ?? []).slice(0, 4),
    habit: j.habit ?? '',
  }
}

export type DiagnosisOutcome =
  | { status: 'created'; report: DiagnosisReport }
  | { status: 'not_enough'; count: number; daysLeft: number }
  | { status: 'in_progress'; count: number; daysLeft: number }

/**
 * 4주 주기를 마감하고 진단표를 만든다.
 * force=false: 28일이 지나지 않았으면 만들지 않는다 (크론·자동 경로).
 * force=true : 학생이 "진단표"를 요청한 경우 — 28일 전이라도 표본이 충분하면 중간 진단을 만든다.
 */
export async function runDiagnosis(userKey: string, force = false, now = Date.now()): Promise<DiagnosisOutcome> {
  const user = await getOrCreateUser(userKey)
  const due = now - user.cycleStart >= CYCLE_MS
  const qs = (await listQuestions(userKey, user.cycleStart, now)).filter(q => q.note.legible)
  const daysLeft = Math.max(0, Math.ceil((user.cycleStart + CYCLE_MS - now) / 86400000))

  if (!due && !force) return { status: 'in_progress', count: qs.length, daysLeft }
  if (qs.length < MIN_QUESTIONS) {
    // 표본이 부족하면 주기를 닫지 않고 계속 누적한다
    return { status: 'not_enough', count: qs.length, daysLeft }
  }

  const { stats, errorTotals } = aggregate(qs)
  const solution = await generateSolution(stats, errorTotals, qs)
  const report: DiagnosisReport = {
    id: newId(),
    userKey,
    createdAt: now,
    periodStart: user.cycleStart,
    periodEnd: now,
    total: qs.length,
    stats,
    errorTotals,
    solution,
    caveats: buildCaveats(qs, stats),
  }
  await saveReport(report)
  // 중간 진단(force && !due)은 주기를 닫지 않는다
  await updateUser(userKey, {
    lastReportId: report.id,
    pendingReportId: report.id,
    ...(due ? { cycleStart: now } : {}),
  })
  return { status: 'created', report }
}
