// 카카오 i 오픈빌더 스킬 서버 요청/응답 타입 (응답 버전 2.0)

export interface KakaoSkillRequest {
  userRequest: {
    utterance: string
    callbackUrl?: string
    user: { id: string; type?: string; properties?: Record<string, string> }
    params?: { media?: { type?: string; url?: string } } & Record<string, unknown>
  }
  action?: { params?: Record<string, string>; detailParams?: Record<string, unknown> }
  bot?: { id: string }
}

export type ErrorType = 'concept' | 'calculation' | 'condition' | 'strategy' | 'none' | 'unknown'

export const ERROR_TYPE_LABEL: Record<ErrorType, string> = {
  concept: '개념 이해 부족',
  calculation: '계산 실수',
  condition: '조건 해석 오류',
  strategy: '풀이 전략 부재',
  none: '오류 없음',
  unknown: '판단 불가(풀이 없음)',
}

/** 손글씨 노트 1장 분량의 구조화된 답변 */
export interface NoteData {
  problem: string               // 문제 원문 (LaTeX는 $...$)
  topic_code: string            // curriculum.ts 코드
  topic_confidence: 'high' | 'low'
  why: string                   // 이 문제의 핵심
  steps: { title: string; body: string }[]
  check: string                 // 수학적으로 확실하게
  pitfall: string               // 자주 틀리는 지점 (오답 경로와 오답값)
  answer: string
  summary: string[]             // 최대 4개
  bubble: string                // 캐릭터 말풍선 (해요체)
  has_student_work: boolean
  student_verdict: 'correct' | 'wrong' | 'none'
  error_type: ErrorType
  student_feedback: string      // 학생 풀이가 있을 때 어디서 틀렸는지
  legible: boolean              // 사진 판독 가능 여부
}

// ── 학원·학생 명부 ──────────────────────────────
export interface Academy {
  id: string
  name: string
  createdAt: number
}

/** enrolled = 재학생, repeat = N수생 */
export type StudentStatus = 'enrolled' | 'repeat'

export interface Student {
  id: string
  name: string
  status: StudentStatus
  grade: 1 | 2 | 3 | null        // N수생은 null
  school: string                 // N수생은 출신 고교 (선택)
  academyId: string
  targetYear: number             // 목표 수능 학년도 (2028 = 2022 개정 교육과정 첫 수능)
  memo: string
  active: boolean
  createdAt: number
  // 카카오 연결
  linkCode: string | null        // 1회용 연결 코드, 연결되면 null
  kakaoUserKey: string | null
  consentAt: number | null
  // 4주 진단 주기 (첫 질문 시각부터)
  cycleStart: number | null
  pendingReportId: string | null
  lastReportId: string | null
}

export interface QuestionRecord {
  id: string
  studentId: string
  userKey: string
  createdAt: number
  status?: 'done'
  note: NoteData
  model: string
  brainUsed: boolean
}

/** 답변 작성 중이거나 실패한 질문 (1분 콜백을 넘긴 경우 노트 링크가 먼저 나간다) */
export interface PendingQuestion {
  id: string
  studentId: string
  userKey: string
  createdAt: number
  status: 'pending' | 'failed'
}

export interface TopicStat {
  code: string
  label: string
  asked: number
  withWork: number
  wrong: number
  errors: Partial<Record<ErrorType, number>>
}

export interface DiagnosisReport {
  id: string
  studentId: string
  createdAt: number
  periodStart: number
  periodEnd: number
  total: number
  stats: TopicStat[]
  errorTotals: Partial<Record<ErrorType, number>>
  solution: {
    headline: string
    priorities: { code: string; label: string; reason: string; action: string }[]
    prerequisites: string[]
    weekly_plan: { week: number; focus: string; tasks: string[] }[]
    habit: string
  }
  caveats: string[]
  /** 패스드림 테스트 단원별 합계 (이번 주기에 가져온 시험) */
  testStats?: TestStat[]
  tests?: { title: string; submittedAt: string; score: string; rank: string }[]
}

export interface TestStat {
  key: string          // 대단원 코드를 + 로 이은 값, 대응 없으면 패스드림 단원명
  label: string
  codes: string[]
  tests: number
  items: number
  correct: number
  classCorrect: number
  classTotal: number
}

// ── 패스드림 테스트 결과 ───────────────────────
export interface TestUnit {
  label: string        // 패스드림 단원명
  codes: string[]      // 2022 개정 대단원 코드
  items: number
  correct: number
  classCorrect: number
  classTotal: number
}

export interface TestResult {
  id: string           // 학생·시험·제출일로 만든 고정 ID — 같은 PDF를 다시 올려도 중복되지 않는다
  studentId: string
  academyId: string
  source: 'passdream'
  title: string
  course: string
  submittedAt: string  // YYYY-MM-DD
  takenAt: number      // submittedAt의 epoch ms (기간 조회용)
  totalItems: number
  correct: number
  rank: number | null
  classSize: number | null
  units: TestUnit[]
  wrongItems: number[]
  wrongComplete: boolean
  importedAt: number
}
