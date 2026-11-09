// 앱 전체에서 쓰는 Claude 모델과 응답 처리 공통 함수
import type Anthropic from '@anthropic-ai/sdk'

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5'

// Opus 5.5는 생각(thinking)을 끌 수 없고, 생각 토큰도 max_tokens에 포함된다.
// 예전 1024~2048 한도로는 답이 잘리므로 넉넉히 둔다 (비스트리밍 권장 상한).
export const MAX_TOKENS = 16000

// 설치된 SDK(0.80) 타입에는 xhigh가 없어 제외한다
export type Effort = 'low' | 'medium' | 'high' | 'max'
export const DEFAULT_EFFORT: Effort = (process.env.CLAUDE_EFFORT as Effort) || 'medium'

/**
 * 응답에서 텍스트만 모은다.
 * Opus 5.5 응답은 content[0]이 thinking 블록일 수 있어 content[0].text로 읽으면 빈 문자열이 된다.
 */
export function textOf(res: Anthropic.Message): string {
  if (res.stop_reason === 'max_tokens') throw new Error('AI 응답이 길이 제한에서 잘렸습니다.')
  if (res.stop_reason === 'refusal') throw new Error('AI가 이 요청에 답하지 않았습니다.')
  return res.content.map(b => (b.type === 'text' ? b.text : '')).join('')
}
