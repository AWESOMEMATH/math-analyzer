import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkAndIncrementUsage } from '@/lib/usage'
import fs from 'fs'
import path from 'path'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 교육과정 JSON 로드
let curriculumData = ''
try {
  const curriculumPath = path.join(process.cwd(), 'data', 'curriculum_2022_math.json')
  curriculumData = fs.readFileSync(curriculumPath, 'utf-8')
} catch (e) {
  console.error('교육과정 JSON 로드 실패:', e)
  curriculumData = '{"error": "교육과정 데이터를 로드할 수 없습니다"}'
}

// ===== 기존 analyze/route.ts에서 그대로 복사한 프롬프트 =====

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
6. [지수 판독 — 이중 확인 필수] 
   x², x³, x⁴ 등 위첨자 지수는 가장 오독이 잦은 기호다.
   모든 지수를 전사할 때 반드시 아래 절차를 따르라:
   a) 해당 지수를 처음 읽는다.
   b) 주변 맥락(인수분해 가능성, 선택지, 학생 풀이)과 대조한다.
   c) 예: x²-4는 (x+2)(x-2)로 인수분해 가능하지만, x³-4는 이렇게 인수분해 불가.
      학생이 (x+2)(x-2)를 사용했다면 원문은 x²-4일 확률이 극히 높다.
   d) 최종 전사 시 모든 지수를 명시적으로 표기: "x^2", "x^3" 등으로 반드시 구분.
7. [인쇄체 vs 손글씨 지수 교차검증]
   인쇄된 문제의 지수와 학생 손글씨의 지수가 서로 다르게 읽힌다면,
   인쇄체를 한 번 더 확대해서 확인하라.
   인쇄체 폰트에서 2와 3은 상단 곡선 형태로 구분 가능하다.
`

// ===== 프리미엄 전용 분석 프롬프트 =====

const PROMPT_PREMIUM_ANALYZE = `너는 27년 경력 수학 교사 어썸 정현경이야.

[핵심 원칙 — 기존 분석과 동일]
1. 학생 풀이가 수학적으로 올바르면 반드시 "정답"으로 판정하라.
2. 소괄호(), 중괄호{} 등 괄호 형태의 차이나 단순 치환 생략은 오류가 아니다.
3. [시각적 교차 검증 강제] OCR 텍스트의 등호(=)/음수(-) 오독에 주의. 최종 계산 결과가 틀렸다고 판단될 경우, 직접 연산 및 원본 이미지를 육안으로 재확인하라.
4. 학생이 선택지에 체크한 답과 너의 계산 답이 일치하면 "정답"으로 판정하라.
5. [발문 역추적 교정] OCR 엔진의 지수 오독 가능성을 항상 염두에 두고, 학생 풀이가 논리적이면 학생이 아닌 OCR이 틀렸을 확률이 높다.

[프리미엄 분석 추가 원칙 — 이것이 일반 분석과의 차이점이다]

## 절대 금지 표현 (이런 말은 절대 쓰지 마라)
- "주의하세요", "다시 확인해보세요", "실수가 있는 것 같습니다"
- "계산을 꼼꼼히 하세요", "부호에 주의하세요"
- "~할 수 있습니다", "~일 수 있습니다" 같은 모호한 추측
- 어떤 형태의 애매하거나 두루뭉술한 표현도 금지

## 오류 지적 시 필수 포함 요소 4가지
모든 오류를 지적할 때 아래 4가지를 반드시 모두 포함하라:
1. **정확한 위치**: 몇 번째 행(또는 몇 번째 단계)에서 발생했는지
2. **구체적 오류 내용**: 어떤 연산에서 구체적으로 무엇이 틀렸는지 (예: "3행에서 양변에 -2를 곱할 때 우변의 부호를 바꾸지 않았다")
3. **교육과정 근거**: 이 오류가 어느 학년, 어느 학기, 어느 단원의 어떤 개념/성질/정리와 관련되는지 명시 (예: "중2 1학기 '일차부등식' 단원 — 부등식의 성질: 양변에 음수를 곱하거나 나누면 부등호의 방향이 바뀐다")
4. **올바른 풀이**: 해당 단계의 올바른 계산 과정을 구체적으로 제시

## 교육과정 참조 데이터 (2022 개정 교육과정, 교육부고시 제2022-33호)
${curriculumData}

[채점 순서 - Chain of Thought 필수]
0단계(최우선): 문제-학생 일치성 확인 (기존과 동일)
1단계: 발문 분석 — 원본 이미지에서 인쇄체를 직접 읽어 OCR 오독 교정
1-A단계(프리미엄): 이 문제가 교육과정상 어느 학년/학기/단원에 해당하는지 판별
2단계: 학생의 식을 한 줄씩 따라가며 직접 전개/대입하여 검증
3단계: 최종 계산 값의 부호(±) 검증 및 원본 이미지 재확인
4단계: 검증 완료 후 JSON 출력

## 판독 불가 처리
- 글씨가 불명확하거나 판독할 수 없는 부분은 절대 추측하지 않는다
- "판독 불가" 영역으로 명시하고, 이것 자체를 습관 교정 요소로 기록한다

[출력 규격]
반드시 <thinking> 태그 안에서 모든 수학적 검증을 상세히 기록한 후, <r> 태그 안에 순수 JSON 객체만 출력.
<thinking>
0. 문제-학생 일치성: ...
1. 발문 재확인: ...
1-A. 교육과정 매핑: [학년] [학기] [단원] [토픽]
2. 검증: ...
</thinking>
<r>
{
  "analysis_type": "premium",
  "curriculum_mapping": {
    "grade": "중2",
    "semester": "1학기",
    "chapter": "일차부등식",
    "topic": "일차부등식"
  },
  "error_type": "정답/논리오류/계산실수/독해오류",
  "steps": [ {"step": 1, "content": "...", "is_correct": true, "curriculum_note": "해당시 교육과정 근거"} ],
  "error_location": "없음 또는 구체적 위치",
  "error_explanation": "구체적이고 애매하지 않은 설명 (필수 포함 요소 4가지 모두 포함)",
  "correct_solution": "올바른 풀이 수식",
  "correct_direction": "풀이 방향",
  "curriculum_feedback": "이 학생이 복습해야 할 교육과정 단원과 핵심 개념",
  "legibility_issues": "판독 불가 영역이 있었다면 기술, 없으면 null",
  "good_points": "잘한 점",
  "encouragement": "격려 메시지"
}
</r>`

// ===== 기존 analyze/route.ts에서 그대로 복사한 풀이 프롬프트 =====

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

// ===== 기존 analyze/route.ts에서 그대로 복사한 유틸 =====

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

// ===== API 핸들러 (기존 analyze/route.ts와 동일한 흐름) =====

export async function POST(req: NextRequest) {
  let inviteCode = req.headers.get('x-invite-code')
    || req.cookies.get('invite_code')?.value || 'anonymous'
  try { inviteCode = decodeURIComponent(inviteCode) } catch {}

  const body = await req.json()
  const { base64Image, mediaType = 'image/jpeg', problemNum = '', analysisMode = 'error', uploadMode = 'single', problemImage, problemMediaType } = body

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
    // 1단계: Claude Vision OCR (기존과 동일)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ocrContent: any[] = uploadMode === 'separate' ? [
      { type: 'text', text: '아래 첫 번째 이미지는 수학 문제 원본이고, 두 번째 이미지는 학생의 손글씨 풀이입니다.' },
      { type: 'image', source: { type: 'base64', media_type: problemMediaType, data: problemImage } },
      { type: 'text', text: '[학생 풀이 이미지]\n' + PROMPT_OCR },
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
    ] : [
      { type: 'text', text: PROMPT_OCR },
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
    ]

    const ocrRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: ocrContent }]
    })
    const ocrText = ocrRes.content[0].type === 'text' ? ocrRes.content[0].text : ''

    // 지수 검증 (기존과 동일)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyContent: any[] = uploadMode === 'separate' ? [
      { type: 'text', text: `아래 첫 번째 이미지는 문제 원본, 두 번째 이미지는 학생 풀이입니다. OCR 결과에서 지수(위첨자) 표기가 정확한지 대조하여 검증하라.
틀린 지수가 있다면 수정된 전체 OCR 텍스트를 출력하라.
틀린 지수가 없다면 "VERIFIED"라고만 출력하라.

[학생 풀이 OCR 결과]
${ocrText}` },
      { type: 'image', source: { type: 'base64', media_type: problemMediaType, data: problemImage } },
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
    ] : [
      { type: 'text', text: `아래 OCR 결과에서 지수(위첨자) 표기가 정확한지 원본 이미지와 대조하여 검증하라.
틀린 지수가 있다면 수정된 전체 OCR 텍스트를 출력하라.
틀린 지수가 없다면 "VERIFIED"라고만 출력하라.

[OCR 결과]
${ocrText}` },
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
    ]

    const verifyRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: verifyContent }]
    })
    const verifyText = verifyRes.content[0].type === 'text' ? verifyRes.content[0].text : ''
    const finalOcrText = verifyText.trim() === 'VERIFIED' ? ocrText : verifyText

    // 2단계: 분석 — 여기서만 프리미엄 프롬프트 사용
    const isSolve = analysisMode === 'solve'
    const instruction = isSolve
      ? '위 OCR 텍스트와 첨부 이미지를 바탕으로 수학 문제를 이해하기 쉽고 명확하게 풀어주세요. JSON만 출력하세요.'
      : '위 OCR 텍스트와 첨부 이미지를 바탕으로 학생 풀이를 교육과정에 근거하여 정밀 분석하고, JSON만 출력하세요.'

    const userMsg = `[문제 번호] ${problemNum || '미입력'}

⚠️ 아래 OCR 텍스트에는 판독 오류가 있을 수 있습니다. 반드시 첨부된 이미지 원본과 대조하세요.

[Claude Vision OCR 결과]
${finalOcrText}

${instruction}`

    // ★ 핵심 차이: error 모드일 때 PROMPT_PREMIUM_ANALYZE를 사용
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analysisContent: any[] = uploadMode === 'separate' ? [
      { type: 'text', text: userMsg },
      { type: 'image', source: { type: 'base64', media_type: problemMediaType, data: problemImage } },
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
    ] : [
      { type: 'text', text: userMsg },
      { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: base64Image } }
    ]

    const analysisRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: isSolve ? PROMPT_ANALYZE_SOLVE : PROMPT_PREMIUM_ANALYZE,
      messages: [{ role: 'user', content: analysisContent }]
    })

    const jsonText = analysisRes.content[0].type === 'text' ? analysisRes.content[0].text : ''
    const parsed = extractJSON(jsonText)

    if (!parsed) {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 })
    }

    return NextResponse.json({
      ...parsed,
      _ocr: finalOcrText,
      _ocrEngine: 'Claude Vision',
      _analysisMode: analysisMode,
      _analysisType: 'premium',
      used: usage.used,
      limit: usage.limit
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류'
    const status = msg.includes('credit') ? 402 : msg.includes('401') ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
