import Anthropic from '@anthropic-ai/sdk'
import { chapterLabel, findTopic, loadTopics } from './curriculum'
import { ANSWER_MODEL } from './answer'
import { MAX_TOKENS, textOf } from '@/lib/claude'
import { CYCLE_MS, examKey, getExamMap, getStudent, listQuestions, listTestResults, newId, saveReport, updateStudent } from './store'
import { ERROR_TYPE_LABEL, type DiagnosisReport, type ErrorType, type QuestionRecord, type Student, type ExamMap, type TestResult, type TestStat, type TestTopicStat, type TopicStat } from './types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** 이보다 적으면 진단표를 만들지 않는다 — 몇 문항으로 "취약 단원"을 단정하면 오진이 된다 */
export const MIN_QUESTIONS = Number(process.env.DIAG_MIN_QUESTIONS || 8)
/** 질문이 적어도 테스트가 이만큼 있으면 진단표를 만든다 */
export const MIN_TESTS = Number(process.env.DIAG_MIN_TESTS || 2)

/** 확정된 시험지 연결이 있는 시험만 — 세부 단원별 출제·오답 */
export function aggregateTestTopics(tests: TestResult[], maps: Map<string, ExamMap>): TestTopicStat[] {
  const out = new Map<string, TestTopicStat>()
  for (const t of tests) {
    const m = maps.get(examKey(t.title))
    // 틀린 문항 번호가 다 확인되지 않은 시험은 「맞음」으로 잘못 셀 수 있어 뺀다
    if (!m || m.status !== 'confirmed' || !t.wrongComplete) continue
    const wrong = new Set(t.wrongItems)
    for (const it of m.items) {
      if (!it.topic_code) continue
      const tp = findTopic(it.topic_code)
      const st = out.get(it.topic_code) ?? {
        code: it.topic_code, label: tp ? `${tp.course} > ${tp.chapter} > ${tp.topic}` : it.topic_code,
        items: 0, wrong: 0, wrongNos: [],
      }
      st.items++
      if (wrong.has(it.no)) { st.wrong++; st.wrongNos.push(`${t.title} ${it.no}번`) }
      out.set(it.topic_code, st)
    }
  }
  const order = new Map(loadTopics().map(x => [x.code, x.order]))
  return [...out.values()].sort((a, b) => (order.get(a.code) ?? 1e9) - (order.get(b.code) ?? 1e9))
}

export async function loadExamMaps(tests: TestResult[]): Promise<Map<string, ExamMap>> {
  const keys = [...new Set(tests.map(t => examKey(t.title)))]
  const maps = await Promise.all(keys.map(k => getExamMap(k)))
  return new Map(maps.filter((m): m is ExamMap => !!m).map(m => [m.id, m]))
}

/** 테스트 단원별 합계 — 같은 대단원끼리 여러 시험을 더한다 */
export function aggregateTests(tests: TestResult[]): TestStat[] {
  const map = new Map<string, TestStat>()
  for (const t of tests) {
    for (const u of t.units) {
      const key = u.codes.length ? u.codes.join('+') : u.label
      const st = map.get(key) ?? {
        key, codes: u.codes, label: chapterLabel(u.codes) || u.label,
        tests: 0, items: 0, correct: 0, classCorrect: 0, classTotal: 0,
      }
      st.tests++; st.items += u.items; st.correct += u.correct
      st.classCorrect += u.classCorrect; st.classTotal += u.classTotal
      map.set(key, st)
    }
  }
  const order = new Map(loadTopics().map(t => [t.code.split('.').slice(0, 3).join('.'), t.order]))
  return [...map.values()].sort((a, b) => (order.get(a.codes[0]) ?? 1e9) - (order.get(b.codes[0]) ?? 1e9))
}

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

/** 목표 수능 학년도에 따른 출제 범위 — 진단 처방의 우선순위 판단에 쓴다 */
export function examScope(targetYear: number): string {
  if (targetYear >= 2028) {
    return `${targetYear}학년도 수능 (2022 개정 교육과정) — 수학 출제 범위는 대수, 미적분I, 확률과 통계이며 선택과목이 없다. 공통수학1·2는 직접 출제 범위가 아니지만 선수 내용이다.`
  }
  return `${targetYear}학년도 수능 (2015 개정 교육과정) — 공통 수학I·수학II + 선택(확률과 통계/미적분/기하). 단원 코드는 2022 개정 기준이므로 대응 단원으로 읽는다.`
}

function buildCaveats(qs: QuestionRecord[], stats: TopicStat[], st: Student, tests: TestResult[] = []): string[] {
  const c: string[] = []
  const small = tests.filter(t => t.classSize && t.classSize < 10)
  const lo = Math.min(...small.map(t => t.classSize!)), hi = Math.max(...small.map(t => t.classSize!))
  if (small.length) c.push(`반 평균은 응시 인원 ${lo === hi ? lo : `${lo}~${hi}`}명 기준이라 비교 지표로는 약합니다. 학생 본인의 단원별 정답률 위주로 읽어 주세요.`)
  if (tests.some(t => !t.wrongComplete)) c.push('일부 시험은 리포트에 틀린 문항 번호가 모두 나오지 않아 단원별 합계만 반영했습니다.')
  if (st.targetYear < 2028) c.push(`${st.targetYear}학년도 수능은 2015 개정 교육과정 기준입니다. 표의 단원명은 2022 개정 기준으로 분류한 것이므로 대응 단원으로 읽어 주세요.`)
  const withWork = qs.filter(q => q.note.has_student_work).length
  if (qs.length && withWork < qs.length / 2) {
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
- 근거는 두 가지다. question_topics는 학생이 스스로 질문한 문제(어려워한 단원), test_units는 학원 테스트 결과(실제 정답률)다. 질문하지 않았는데 테스트에서 틀리는 단원을 특히 짚는다.
- test_topics가 있으면 test_units보다 세밀한 근거다. 세부 단원 처방에 우선 쓴다.
- priorities의 code는 question_topics, test_units, test_topics에 나온 code만 쓴다.
- 학생 구분과 목표 수능 범위(student.exam)를 기준으로 우선순위를 정한다. 수능 범위 밖 단원은 선수 개념으로만 다룬다.
- 집계에 근거가 있는 말만 한다. 질문 수가 적은 단원을 단정하지 않는다.
- priorities는 최대 3개. code는 집계에 나온 토픽 코드만 쓴다.
- prerequisites에는 우선 단원을 풀기 위해 먼저 점검해야 할 이전 학년·이전 단원을 교육과정 순서에 맞게 적는다.
- weekly_plan은 4주. 각 주 tasks는 2~3개, 학생이 바로 실행할 수 있는 행동(문항 수·방법)으로 쓴다.
- 합니다체. 비유 금지. 라벨 뒤 콜론 금지.
다른 말 없이 JSON 하나만 출력한다.
{"headline":"한 문장 총평","priorities":[{"code":"","label":"","reason":"","action":""}],"prerequisites":[""],"weekly_plan":[{"week":1,"focus":"","tasks":[""]}],"habit":"풀이 습관 한 가지"}`

async function generateSolution(stats: TopicStat[], errorTotals: Partial<Record<ErrorType, number>>, qs: QuestionRecord[], st: Student, testStats: TestStat[], testTopics: TestTopicStat[]) {
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
    max_tokens: MAX_TOKENS,
    system: SOLUTION_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        student: {
          status: st.status === 'repeat' ? 'N수생' : `고${st.grade}`,
          exam: examScope(st.targetYear),
        },
        total_questions: qs.length,
        error_totals: Object.fromEntries(Object.entries(errorTotals).map(([k, v]) => [ERROR_TYPE_LABEL[k as ErrorType], v])),
        question_topics: topicInfo,
        recent_wrong_feedback: feedbacks,
        // 학원 테스트(패스드림) 대단원별 정답 — code는 대단원 코드를 + 로 이은 값
        test_units: testStats.map(t => ({
          code: t.key, label: t.label, tests: t.tests, correct: t.correct, items: t.items,
          class_rate: t.classTotal ? Math.round((t.classCorrect / t.classTotal) * 100) : null,
        })),
        // 시험지 문항 연결이 확정된 시험의 세부 단원별 오답 — code는 토픽 코드
        test_topics: testTopics.map(t => ({ code: t.code, label: t.label, items: t.items, wrong: t.wrong })),
      }),
    }],
  })
  const text = textOf(res)
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('진단 처방 파싱 실패')
  const j = JSON.parse(m[0]) as DiagnosisReport['solution']
  const valid = new Set([...stats.map(s => s.code), ...testStats.map(t => t.key), ...testTopics.map(t => t.code)])
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
export async function runDiagnosis(studentId: string, force = false, now = Date.now()): Promise<DiagnosisOutcome> {
  const st = await getStudent(studentId)
  if (!st) throw new Error('학생 없음')
  if (!st.cycleStart) return { status: 'in_progress', count: 0, daysLeft: 28 }
  const due = now - st.cycleStart >= CYCLE_MS
  const qs = (await listQuestions(studentId, st.cycleStart, now)).filter(q => q.note.legible)
  const daysLeft = Math.max(0, Math.ceil((st.cycleStart + CYCLE_MS - now) / 86400000))

  const tests = await listTestResults(studentId, st.cycleStart, now)
  if (!due && !force) return { status: 'in_progress', count: qs.length, daysLeft }
  if (qs.length < MIN_QUESTIONS && tests.length < MIN_TESTS) {
    // 표본이 부족하면 주기를 닫지 않고 계속 누적한다
    return { status: 'not_enough', count: qs.length, daysLeft }
  }

  const { stats, errorTotals } = aggregate(qs)
  const testStats = aggregateTests(tests)
  const testTopicStats = aggregateTestTopics(tests, await loadExamMaps(tests))
  const solution = await generateSolution(stats, errorTotals, qs, st, testStats, testTopicStats)
  const report: DiagnosisReport = {
    id: newId(),
    studentId,
    createdAt: now,
    periodStart: st.cycleStart,
    periodEnd: now,
    total: qs.length,
    stats,
    errorTotals,
    solution,
    caveats: buildCaveats(qs, stats, st, tests),
    testStats,
    testTopicStats,
    tests: tests.map(t => ({
      title: t.title, submittedAt: t.submittedAt, score: `${t.correct}/${t.totalItems}`,
      rank: t.rank && t.classSize ? `${t.rank}/${t.classSize}` : '-',
    })),
  }
  await saveReport(report)
  // 중간 진단(force && !due)은 주기를 닫지 않는다
  await updateStudent(studentId, {
    lastReportId: report.id,
    pendingReportId: report.id,
    ...(due ? { cycleStart: now } : {}),
  })
  return { status: 'created', report }
}
