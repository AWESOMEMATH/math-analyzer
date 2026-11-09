// 시험지 PDF → 문항별 세부 단원(2022 개정 토픽 코드) 초안. 선생님이 확인·수정한 뒤 확정한다.
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL, DEFAULT_EFFORT, MAX_TOKENS, textOf } from '@/lib/claude'
import { findTopic, topicCatalog } from '@/lib/kakao/curriculum'
import type { ExamItem } from '@/lib/kakao/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function system(): string {
  return `너는 27년 경력 수학 교사다. 시험지 PDF의 각 문항이 평가하는 세부 단원을 2022 개정 교육과정 토픽 코드로 분류한다.

규칙
- 지정한 문항 번호 범위만 분류한다. 선택과목 문항(23번 이후 등)은 범위에 없으면 무시한다.
- 문항을 실제로 풀 때 결정적으로 쓰는 개념 하나를 고른다. 여러 단원이 섞이면 정답에 이르는 핵심 단계의 단원을 고른다.
  예) 정적분으로 정의된 함수의 극값 → 문제의 핵심이 정적분과 미분의 관계면 정적분, 극값 판정이면 도함수의 활용.
- 2015 개정 수학Ⅰ·수학Ⅱ 문항도 대응하는 2022 개정 코드(대수, 미적분I)로 분류한다.
- summary는 무엇을 묻는지 20자 안팎으로 쓴다. 문항을 그대로 옮기지 않는다.
- points는 [2점]/[3점]/[4점] 표기를 읽는다. 없으면 null.
- 확실하지 않으면 topic_code를 비워 둔다. 추측으로 채우지 않는다.

[교육과정 코드표 — 코드 | 과목 > 단원 > 토픽]
${topicCatalog()}

다른 말 없이 JSON 하나만 출력한다.
{"items":[{"no":1,"topic_code":"H.calculus_1.2.1","summary":"미분계수의 정의","points":2}]}`
}

export async function draftExamItems(pdfBase64: string, from: number, to: number): Promise<ExamItem[]> {
  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: DEFAULT_EFFORT },
    system: system(),
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: `${from}번부터 ${to}번까지 분류하세요.` },
      ],
    }],
  })
  const text = textOf(res)
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('시험지 분석 결과를 읽지 못했습니다')
  const raw = (JSON.parse(m[0]) as { items?: Partial<ExamItem>[] }).items ?? []
  const byNo = new Map(raw.map(r => [Number(r.no), r]))
  // 범위의 모든 번호를 빠짐없이 만들고, 표에 없는 코드는 비운다
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const no = from + i
    const r = byNo.get(no) ?? {}
    const code = typeof r.topic_code === 'string' && findTopic(r.topic_code) ? r.topic_code : ''
    return { no, topic_code: code, summary: typeof r.summary === 'string' ? r.summary : '', points: typeof r.points === 'number' ? r.points : null }
  })
}

/** 직접 입력용 빈 표 */
export function blankItems(from: number, to: number): ExamItem[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ no: from + i, topic_code: '', summary: '', points: null }))
}

/**
 * 연결 검증: 패스드림 단원별 문항 수와 연결표의 대단원별 문항 수를 비교한다.
 * 두 쪽이 다르면 연결이 틀렸거나 패스드림 단원 분류와 기준이 다른 것이다.
 */
export function checkAgainstPassdream(
  items: ExamItem[],
  units: { label: string; codes: string[]; items: number }[],
): { label: string; expected: number; mapped: number; ok: boolean }[] {
  return units.map(u => {
    const mapped = items.filter(it => it.topic_code && u.codes.some(c => it.topic_code.startsWith(c + '.'))).length
    return { label: u.label, expected: u.items, mapped, ok: mapped === u.items }
  })
}
