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

export interface QuestionRecord {
  id: string
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
  userKey: string
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
}
