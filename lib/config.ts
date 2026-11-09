// 배포 설정 점검 — 값은 보여 주지 않고 「있음/없음」만 확인한다.
export interface ConfigItem {
  name: string
  ok: boolean
  required: boolean
  note: string
}

const has = (k: string) => !!process.env[k]?.trim()

function validJson(k: string): boolean {
  try {
    const j = JSON.parse(process.env[k] || '')
    return !!j.private_key && !!j.client_email && !!j.project_id
  } catch { return false }
}

export function checkConfig(): ConfigItem[] {
  const base = process.env.PUBLIC_BASE_URL || ''
  return [
    { name: 'ANTHROPIC_API_KEY', ok: has('ANTHROPIC_API_KEY'), required: true, note: 'Claude 호출' },
    { name: 'FIREBASE_SERVICE_ACCOUNT', ok: validJson('FIREBASE_SERVICE_ACCOUNT'), required: true, note: '서비스 계정 JSON 전체 (private_key·client_email·project_id 포함)' },
    { name: 'ADMIN_PASSWORD', ok: (process.env.ADMIN_PASSWORD || '').length >= 12, required: true, note: '관리자 비밀번호, 12자 이상' },
    { name: 'PORTAL_SECRET', ok: (process.env.PORTAL_SECRET || '').length >= 32, required: true, note: '개인 페이지 링크 서명, 32자 이상 임의 문자열' },
    { name: 'KAKAO_SKILL_SECRET', ok: (process.env.KAKAO_SKILL_SECRET || '').length >= 16, required: true, note: '오픈빌더 스킬 헤더 x-skill-secret 값, 16자 이상' },
    { name: 'PUBLIC_BASE_URL', ok: /^https:\/\/[^/]+$/.test(base.replace(/\/$/, '')), required: true, note: 'https://도메인 (끝 / 없이) — 카톡 링크에 쓰임' },
    { name: 'CRON_SECRET', ok: (process.env.CRON_SECRET || '').length >= 16, required: true, note: 'Vercel Cron 인증, 16자 이상' },
    { name: 'KAKAO_CHANNEL_URL', ok: has('KAKAO_CHANNEL_URL'), required: false, note: '관리자 화면 코드 안내에 표시' },
    { name: 'CONSENT_OPERATOR / RETENTION / CONTACT', ok: has('CONSENT_OPERATOR') && has('CONSENT_RETENTION') && has('CONSENT_CONTACT'), required: false, note: '동의 문구 — 법률 검토 후 입력, 없으면 초안 문구 사용' },
    { name: 'BRAIN_API_URL', ok: has('BRAIN_API_URL'), required: false, note: '브레인 연결 (선택)' },
  ]
}

export function missingRequired(): string[] {
  return checkConfig().filter(c => c.required && !c.ok).map(c => c.name)
}
