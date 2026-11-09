import Anthropic from '@anthropic-ai/sdk'
import { topicCatalog, findTopic } from './curriculum'
import { brainPromptBlock, fetchBrainContext } from './brain'
import type { ErrorType, NoteData } from './types'
import { CLAUDE_MODEL, DEFAULT_EFFORT, MAX_TOKENS, textOf, type Effort } from '@/lib/claude'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const ANSWER_MODEL = process.env.KAKAO_MODEL || CLAUDE_MODEL

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
type ImageMedia = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export async function downloadImage(url: string): Promise<{ data: string; mediaType: ImageMedia }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('이미지가 5MB를 넘습니다.')
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  // 카카오 CDN은 content-type을 비우는 경우가 있어 매직 넘버로 판별
  let mediaType: ImageMedia = 'image/jpeg'
  if (ct.includes('png') || buf.subarray(0, 4).toString('hex') === '89504e47') mediaType = 'image/png'
  else if (ct.includes('webp') || buf.subarray(8, 12).toString() === 'WEBP') mediaType = 'image/webp'
  else if (ct.includes('gif') || buf.subarray(0, 3).toString() === 'GIF') mediaType = 'image/gif'
  return { data: buf.toString('base64'), mediaType }
}

const SYSTEM = `너는 27년 경력 수학 교사 어썸 정현경이다. 학생이 카카오톡으로 보낸 수학 문제 사진에 답하는 "AWESOME 손글씨 노트" 원고를 쓴다.

[작업 순서 — 반드시 지킬 것]
1. 사진에서 인쇄된 문제(인쇄 영역)와 학생 손글씨(손글씨 영역)를 먼저 나눈 뒤, 인쇄된 문제를 그대로 전사한다.
   판독 오류 방지 (math-analyzer OCR 규칙)
   - 지수 이중 확인: 위첨자 지수를 읽은 뒤 인수분해 가능성·선택지·학생 풀이와 대조한다.
     예) 학생이 (x+2)(x-2)를 썼다면 원문은 x^3-4가 아니라 x^2-4일 가능성이 높다. 인쇄체 2와 3은 위쪽 곡선으로 구분한다.
   - 등호(=)와 음수(-) 혼동: 학생이 줄을 바꿔 "= 4/27"처럼 쓴 것을 "-4/27"로 읽지 않는다. 앞 줄과 이어지는 등호인지 부호 계산으로 확인한다.
   - Q(x), x, f(x)를 구분하고, A = B·Q(x) + r(x)에서 +r(x)가 괄호 밖에 있는지 확인한다.
   - 학생이 선택지(①~⑤)에 표시한 답이 있으면 그 번호를 학생 답으로 본다.
   - 학생 풀이가 문제와 다른 식에서 출발하면, 학생이 틀렸다고 보기 전에 네가 문제를 잘못 읽었는지 사진을 다시 확인한다.
   - 소괄호·중괄호 차이나 단순 치환 생략은 오류가 아니다. 학생이 표시한 답과 네 답이 같으면 중간 줄의 사소한 판독 차이로 오답 판정하지 않는다.
2. 학생 손글씨 풀이가 있으면 줄 단위로 읽고, 네 풀이와 대조해 정답/오답과 첫 오류 지점을 찾는다.
3. 직접 풀고, 최종 답을 다른 방법(대입·역산·수치 확인)으로 한 번 더 검산한다. 검산이 맞지 않으면 다시 푼다.
4. 아래 교육과정 코드표에서 이 문제가 평가하는 토픽 코드 하나를 고른다. 애매하면 가장 가까운 것을 고르고 topic_confidence를 "low"로 둔다.
5. 사진이 흐리거나 잘려 문제를 확정할 수 없으면 legible=false로 두고 추측으로 풀지 않는다.

[문체 규정]
- 본문(why, steps, check, pitfall, summary, student_feedback)은 합니다체. 말풍선(bubble)만 해요체.
- 비유·생활어로 수학을 설명하지 않는다. 교과서 용어를 쓴다.
- 수식은 LaTeX로 $...$ 안에 쓴다. 한 줄에 등호는 하나만 쓰고, 식을 이어 쓸 때는 줄을 바꾼다(\\n).
- 라벨 뒤에 콜론(:)을 쓰지 않는다.
- pitfall에는 실제로 학생들이 빠지는 오답 경로와 그때 나오는 오답값을 구체적으로 적는다.
- steps는 2~4개. summary는 최대 4개, 다른 문제에도 다시 쓰이는 사고 절차 위주로 쓴다.

[error_type 기준] (학생 풀이가 없으면 "unknown", 맞았으면 "none")
- concept: 정의·성질·공식을 잘못 알고 있음
- calculation: 방향은 맞으나 계산·부호·전개 실수
- condition: 문제 조건(범위, 정수 조건, 단서)을 놓치거나 잘못 해석
- strategy: 무엇부터 해야 할지 접근을 못 함, 풀이가 중단됨

[교육과정 코드표 — 코드 | 과목 > 단원 > 토픽]
${topicCatalog()}

[출력] 다른 말 없이 아래 JSON 하나만 출력한다.
{
  "legible": true,
  "problem": "문제 원문",
  "topic_code": "H.algebra.3.2",
  "topic_confidence": "high",
  "why": "이 문제가 묻는 핵심 한두 문장",
  "steps": [{"title": "조건을 식으로", "body": "..."}],
  "check": "그림·직관이 아니라 식으로 확인하는 근거",
  "pitfall": "자주 틀리는 지점과 그 오답값",
  "answer": "최종 답 (선택지면 번호와 값)",
  "summary": ["..."],
  "bubble": "학생에게 건네는 짧은 한마디 (해요체)",
  "has_student_work": false,
  "student_verdict": "none",
  "error_type": "unknown",
  "student_feedback": ""
}`

function extractJSON(text: string): Record<string, unknown> | null {
  const tries = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1],
    text.match(/\{[\s\S]*\}/)?.[0],
  ]
  for (const t of tries) {
    if (!t) continue
    try { return JSON.parse(t.trim()) } catch {}
  }
  return null
}

const ERR: ErrorType[] = ['concept', 'calculation', 'condition', 'strategy', 'none', 'unknown']

function normalize(j: Record<string, unknown>): NoteData {
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const hasWork = j.has_student_work === true
  const verdict = (['correct', 'wrong', 'none'] as const).find(v => v === j.student_verdict) ?? 'none'
  let err = (ERR.find(e => e === j.error_type) ?? 'unknown') as ErrorType
  if (!hasWork) err = 'unknown'
  else if (verdict === 'correct') err = 'none'
  const code = s(j.topic_code)
  return {
    legible: j.legible !== false,
    problem: s(j.problem),
    topic_code: findTopic(code) ? code : '',
    topic_confidence: j.topic_confidence === 'high' && findTopic(code) ? 'high' : 'low',
    why: s(j.why),
    steps: Array.isArray(j.steps)
      ? (j.steps as { title?: unknown; body?: unknown }[]).slice(0, 4).map(x => ({ title: s(x.title), body: s(x.body) }))
      : [],
    check: s(j.check),
    pitfall: s(j.pitfall),
    answer: s(j.answer),
    summary: Array.isArray(j.summary) ? (j.summary as unknown[]).map(s).filter(Boolean).slice(0, 4) : [],
    bubble: s(j.bubble),
    has_student_work: hasWork,
    student_verdict: hasWork ? verdict : 'none',
    error_type: err,
    student_feedback: s(j.student_feedback),
  }
}

export async function answerFromImage(
  image: { data: string; mediaType: ImageMedia },
  studentText?: string,
): Promise<{ note: NoteData; brainUsed: boolean; usage: Anthropic.Usage; ms: number }> {
  const t0 = Date.now()
  const brain = await fetchBrainContext(studentText || '수학 문제')
  const res = await anthropic.messages.create({
    model: ANSWER_MODEL,
    // 생각(thinking) 토큰도 max_tokens에 포함된다
    max_tokens: MAX_TOKENS,
    output_config: { effort: (process.env.KAKAO_EFFORT as Effort) || DEFAULT_EFFORT },
    // 교육과정 코드표가 든 시스템 프롬프트는 매번 같으므로 캐시 (입력 단가 1/10)
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      ...(brain ? [{ type: 'text' as const, text: brainPromptBlock(brain) }] : []),
    ],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          { type: 'text', text: studentText ? `학생 메시지: ${studentText}` : '이 문제를 풀어 주세요.' },
        ],
      },
    ],
  })
  console.log('kakao answer usage', JSON.stringify(res.usage))
  const text = textOf(res)
  const j = extractJSON(text)
  if (!j) throw new Error('AI 응답 파싱 실패')
  return { note: normalize(j), brainUsed: !!brain, usage: res.usage, ms: Date.now() - t0 }
}
