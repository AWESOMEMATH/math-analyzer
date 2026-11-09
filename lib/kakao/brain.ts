// 브레인(aml_brain) 연동 어댑터.
//
// 브레인 DB(약 4.4GB SQLite)는 연구실 PC에 있어 클라우드 서버에서 직접 열 수 없다.
// 연구실 PC에서 brain_* 조회를 HTTP로 열어 두고(터널 등) BRAIN_API_URL로 연결하면
// 같은 유형의 기출·테크닉을 풀이 프롬프트에 근거로 넣는다.
// 연결이 없거나 3초 안에 응답이 없으면 교육과정 JSON만으로 답변한다 (brainUsed=false로 기록).
//
// 기대하는 엔드포인트 (연구실 측에서 구현):
//   POST {BRAIN_API_URL}/context  { "query": "<문제 텍스트 일부>" }
//   → { "techniques": string[], "similar": { "id": string, "summary": string }[] }

export interface BrainContext {
  techniques: string[]
  similar: { id: string; summary: string }[]
}

export async function fetchBrainContext(query: string): Promise<BrainContext | null> {
  const base = process.env.BRAIN_API_URL
  if (!base) return null
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/context`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.BRAIN_API_TOKEN ? { authorization: `Bearer ${process.env.BRAIN_API_TOKEN}` } : {}),
      },
      body: JSON.stringify({ query: query.slice(0, 500) }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as Partial<BrainContext>
    return {
      techniques: (j.techniques ?? []).slice(0, 8),
      similar: (j.similar ?? []).slice(0, 5),
    }
  } catch {
    return null
  }
}

export function brainPromptBlock(ctx: BrainContext | null): string {
  if (!ctx || (!ctx.techniques.length && !ctx.similar.length)) return ''
  return `
[브레인 DB 참고 자료 — 같은 유형의 기출·테크닉]
테크닉: ${ctx.techniques.join(' / ') || '없음'}
유사 기출: ${ctx.similar.map(s => `${s.id}: ${s.summary}`).join(' / ') || '없음'}
위 자료는 풀이 방향 참고용이다. 숫자·조건은 반드시 이 문제 이미지 기준으로 다시 계산하라.`
}
