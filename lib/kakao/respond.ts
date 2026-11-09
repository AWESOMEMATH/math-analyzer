// 카카오 스킬 응답 템플릿 (version 2.0)

type Output = Record<string, unknown>

const QUICK = [
  { label: '내 기록', action: 'message', messageText: '내 기록' },
  { label: '진단표', action: 'message', messageText: '진단표' },
  { label: '사용법', action: 'message', messageText: '사용법' },
]

export function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function simpleText(text: string): Output {
  return { simpleText: { text: clip(text, 1000) } }
}

export function linkCard(title: string, description: string, label: string, url: string): Output {
  return {
    textCard: {
      title: clip(title, 50),
      description: clip(description, 400),
      buttons: [{ action: 'webLink', label: clip(label, 14), webLinkUrl: url }],
    },
  }
}

type Quick = { label: string; action: 'message'; messageText: string }

export function quick(...labels: string[]): Quick[] {
  return labels.map(l => ({ label: l, action: 'message', messageText: l }))
}

export function template(outputs: Output[], quickReplies: Quick[] = QUICK as Quick[]) {
  return { version: '2.0', template: { outputs: outputs.slice(0, 3), ...(quickReplies.length ? { quickReplies } : {}) } }
}

/** 5초 안에 먼저 보내는 즉답 — 오픈빌더에서 콜백 사용이 켜져 있어야 한다 */
export function callbackAck(text: string) {
  return { version: '2.0', useCallback: true, data: { text } }
}

export async function postCallback(callbackUrl: string, body: unknown) {
  const res = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) console.error('카카오 콜백 실패', res.status, await res.text().catch(() => ''))
}
