import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkAndIncrementUsage } from '@/lib/usage'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT_OCR = `당신은 한국 고등학교 수학 풀이 전사 전문가입니다. 단 하나의 임무만 수행합니다.
[임무] 이미지에 보이는 모든 수학 기호와 손글씨를 형상 그대로 LaTeX 텍스트로 완벽하게 전사하라.
[이미지 영역 분리 — 최우선 수행]
A. 인쇄 영역: 문제 발문 그대로 전사
B. 손글씨 영역: 학생 풀이를 줄 순서대로 전사 (L1: ..., L2: ...)
[한국 수학 손글씨 오독 방지 및 패턴 인식]
1. Q(x), x, f(x) 기호 정확히 구분.
2. 나눗셈 정리 구조: A = B·Q(x) + r(x) 형태에서 +r(x)는 괄호 바깥에 위치.
3. 괄호 깊이: (A)(B) + C 형태에서 부호 위치 주의.
4. [치명적 오류 - 등호(=)와 음수(-) 오독 절대 주의]
   학생이 줄을 바꿔서 "= 숫자" 형태를 적을 때, 등호(=)를 음수(-)로 오독하는 경우가 매우 잦다. 
   예: r(2/3) 계산 후 아랫줄에 "= 4/27"이라 적은 것을 "-4/27"로 오독하지 말 것. 
   최종 답안 앞의 기호가 위 줄에서 이어지는 등호인지 마이너스인지, 앞선 괄호의 부호 곱셈 결과 등을 통해 한 번 더 점검하라.
5. 학생이 선택지(① ② ③ ④ ⑤)에 체크한 답 번호가 있다면 반드시 [선택: ⑤] 형태로 기록.
6. [지수 오독 절대 주의] x², x³, x⁴ 등 인쇄된 위첨자 지수를 정확히 구분하라. 
   특히 x²과 x³은 형태가 유사하여 오독이 잦다. 
   문제 발문의 지수는 반드시 2회 이상 확인하고, 
   학생 풀이에서 사용한 지수와 불일치 시 "학생이 틀린 것"이 아니라 "내가 오독한 것"일 가능성을 먼저 의심하라.
`

const PROMPT_ANALYZE_ERROR = `너는 27년 경력 수학 교사 어썸 정현경이야.
[핵심 원칙]
1. 학생 풀이가 수학적으로 올바르면 반드시 "정답"으로 판정하라.
2. 소괄호(), 중괄호{} 등 괄호 형태의 차이나 단순 치환 생략은 오류가 아니다.
3. [시각적 교차 검증 강제 - 중요] OCR 텍스트는 등호(=)를 음수 기호(-)로 오독하는 고질적 결함이 있다. 
   최종 계산 결과가 틀렸다고 판단될 경우, OCR 텍스트를 절대 맹신하지 마라.
   1) 네가 직접 산술 계산을 해보고, 
   2) 반드시 첨부된 '원본 이미지'를 육안으로 재확인하여 판별하라.
4. 학생이 선택지에 체크한 답과 너의 계산 답이 일치하면, 중간 단계의 미세한 오독을 무시하고 "정답"으로 판정하라.
5. [발문 역추적 교정 - 최우선 수행] OCR 엔진은 문제지의 인쇄된 지수를 오독하는 경우가 잦다. 학생의 전개 과정이 특정 식을 정확히 가리키고 논리적으로 자연스럽다면, 학생이 틀린 것이 아니라 OCR이 문제 발문을 잘못 읽었을 확률이 100%다. 학생 풀이를 '오류'로 판정하기 전에 반드시 원본 이미지의 인쇄된 문제를 육안으로 재확인하여 전제 조건을 스스로 교정한 후 채점하라.
[채점 순서 - Chain of Thought 필수]
0단계(최우선): 문제-학생 일치성 확인
  - 원본 이미지에서 인쇄된 핵심 수식을 직접 읽는다.
  - 학생 풀이의 첫 줄에서 학생이 전제한 수식을 확인한다.
  - 이 둘이 일치하면 → 학생의 수식을 기준으로 채점 진행.
  - 이 둘이 불일치하면 → 학생이 틀린 것이 아니라 내 판독이 틀렸을 확률이 극히 높다. 
    원본 이미지를 다시 확인하고, 학생의 수식이 맞다고 가정한 뒤 채점하라.
1단계: 발문 분석 및 목표식 도출 — 원본 이미지에서 인쇄체를 직접 읽어 OCR 오독 교정
2단계: 학생의 식을 한 줄씩 따라가며 직접 전개/대입하여 검증
3단계: 최종 계산 값의 부호(±)가 틀렸다고 의심될 경우, 직접 연산 및 원본 이미지 픽셀 재확인(Visual Check) 수행
4단계: 검증 완료 후 JSON 출력
[출력 규격]
반드시 <thinking> 태그 안에서 모든 수학적 검증을 상세히 기록한 후, <r> 태그 안에 순수 JSON 객체만 출력.
<thinking>
0. 문제-학생 일치성: 인쇄 수식 = [내가 읽은 것], 학생 전제 수식 = [학생 첫 줄] → 일치/불일치 판정
1. 발문 재확인: ...
2. 검증: ...
</thinking>
<r>
{
  "error_type": "정답/논리오류/계산실수/독해오류",
  "steps": [ {"step": 1, "content": "...", "is_correct": true} ],
  "error_location": "없음 또는 위치",
  "error_explanation": "학생이 이해할 수 있는 설명",
  "correct_solution": "올바른 풀이 수식",
  "correct_direction": "풀이 방향",
  "good_points": "잘한 점",
  "encouragement": "격려 메시지"
}
</r>`

const PROMPT_ANALYZE_SOLVE = `너는 27년 경력 수학 교사 어썸 정현경이야.
[핵심 원칙]
1. 제시된 문제 사진과 수식 OCR 텍스트를 바탕으로, 문제를 가장 모범적이고 명확하게 풀어라.
2. 단계별로 핵심 논리 전개를 수식과 함께 학생 친화적으로 설명하라.
3. [시각적 교차 검증 강제] OCR 텍스트는 간혹 지수나 작은 기호, 괄호 등을 오독하는 고질적 결함이 있다. 풀이를 시작하기 전에 반드시 원본 이미지의 문제를 다시 한 번 육안으로 확인하여 오독된 부분이 있다면 스스로 텍스트를 먼저 교정한 뒤 논리를 펼쳐라.
[풀이 순서 - Chain of Thought 필수]
1단계: 발문 파악 및 조건 정리 — 원본 이미지 인쇄체 재확인
2단계: 문제 해결을 위한 핵심 아이디어 구상
3단계: 수학적으로 완벽한 전개를 하나의 흐름으로 상세히 서술하여 정답 도출
4단계: 검증 완료 후 JSON 출력
[출력 규격]
반드시 <thinking> 태그 안에서 논리 구조를 생각하고, <r> 태그 안에 순수 JSON 객체만 출력.
<r>
{
  "mode": "solve",
  "problem_understanding": "문제의 조건 및 구하고자 하는 것",
  "full_solution": "끊김 없는 하나의 완전하고 상세한 전체 풀이 과정 (줄바꿈 적극 활용)",
  "final_answer": "최종 도출된 정답",
  "core_concept": "적용된 주요 수학 개념 정리",
  "encouragement": "선생님의 격려 및 조언 한마디"
}
</r>`

function extractJSON(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) } catch {}
  const rMatch = text.match(/<r>([\s\S]*?)<\/r>/)
  if (rMatch) try { return JSON.parse(rMatch[1].trim()) } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) try { return JSON.parse(braceMatch[0]) } catch {}
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeMatch) try { return JSON.parse(codeMatch[1].trim()) } catch {}
  return null
}

export async function POST(req: NextRequest) {
  let inviteCode = req.headers.get('x-invite-code')
    || req.cookies.get('invite_code')?.value || 'anonymous'
  try { inviteCode = decodeURIComponent(inviteCode) } catch {}

  const body = await req.json()
  const { base64Image, mediaType = 'image/jpeg', problemNum = '', analysisMode = 'error' } = body

  if (!base64Image) {
    return NextResponse.json({ error: '이미지 데이터가 없습니다.' }, { status: 400 })
  }

  const usage = await checkAndIncrementUsage(inviteCode)
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `월 분석 한도(${usage.limit}문항)를 초과했습니다. 이번 달 사용: ${usage.used}문항` },
      { status: 429 }
    )
  }

  try {
    // 1단계: Claude Vision OCR
    const ocrRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_OCR },
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
        ]
      }]
    })
    const ocrText = ocrRes.content[0].type === 'text' ? ocrRes.content[0].text : ''

    // 2단계: 분석
    const isSolve = analysisMode === 'solve'
    const instruction = isSolve
      ? '위 OCR 텍스트와 첨부 이미지를 바탕으로 수학 문제를 이해하기 쉽고 명확하게 풀어주세요. JSON만 출력하세요.'
      : '위 OCR 텍스트와 첨부 이미지를 바탕으로 학생 풀이를 분석하고, JSON만 출력하세요.'

    const userMsg = `[문제 번호] ${problemNum || '미입력'}

⚠️ 아래 OCR 텍스트에는 판독 오류가 있을 수 있습니다. 반드시 첨부된 이미지 원본과 대조하세요.

[Claude Vision OCR 결과]
${ocrText}

${instruction}`

    const analysisRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: isSolve ? PROMPT_ANALYZE_SOLVE : PROMPT_ANALYZE_ERROR,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: userMsg },
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
        ]
      }]
    })

    const jsonText = analysisRes.content[0].type === 'text' ? analysisRes.content[0].text : ''
    const parsed = extractJSON(jsonText)

    if (!parsed) {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 })
    }

    return NextResponse.json({
      ...parsed,
      _ocr: ocrText,
      _ocrEngine: 'Claude Vision',
      _analysisMode: analysisMode,
      used: usage.used,
      limit: usage.limit
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    const status = msg.includes('credit') ? 402 : msg.includes('401') ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
