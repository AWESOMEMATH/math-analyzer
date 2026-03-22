import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: chatHistory
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    return NextResponse.json({ text })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '오류' }, { status: 500 })
  }
}
