import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL, DEFAULT_EFFORT, MAX_TOKENS, textOf } from '@/lib/claude'

// Opus 5.5 호출이 여러 번 이어지므로 기본 제한 시간으로는 부족하다
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { chatHistory, analysisContext } = await req.json()

  if (!chatHistory || !analysisContext) {
    return NextResponse.json({ error: '데이터 누락' }, { status: 400 })
  }

  try {
    const systemPrompt = `너는 27년 경력 수학 교사 정현경이야. 방금 학생 풀이를 분석했고 학생이 추가 질문을 하고 있어. 친절하고 명확하게 답해줘. 수학 수식은 LaTeX로 표현해줘 ($...$ 또는 $$...$$).

[방금 분석한 결과]
${JSON.stringify(analysisContext, null, 2)}`

    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: DEFAULT_EFFORT },
      system: systemPrompt,
      messages: chatHistory
    })

    const text = textOf(res)
    return NextResponse.json({ text })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '오류' }, { status: 500 })
  }
}
