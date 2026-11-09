// 학생 개인 페이지 링크 — 로그인 없이 열리지만 서명·만료·폐기가 있다.
// /me/{studentId}.{만료}.{버전}.{서명}
// · 만료: 기본 7일. 링크가 단톡방에 퍼져도 일주일 뒤에는 열리지 않는다.
// · 버전: 코드 재발급 때 올라가며, 그 전에 나간 링크는 모두 무효가 된다.
import { createHmac, timingSafeEqual } from 'crypto'

const TTL_MS = Number(process.env.PORTAL_LINK_DAYS || 7) * 86400000

function secret(): string {
  const s = process.env.PORTAL_SECRET
  if (!s) throw new Error('PORTAL_SECRET 환경변수가 없습니다.')
  return s
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url').slice(0, 32)

export function portalToken(studentId: string, version: number, now = Date.now()): string {
  const exp = Math.floor((now + TTL_MS) / 1000).toString(36)
  const payload = `${studentId}.${exp}.${version}`
  return `${payload}.${sign(payload)}`
}

export type PortalCheck = { ok: true; studentId: string; version: number; expiresAt: number } | { ok: false; reason: 'invalid' | 'expired' }

export function verifyPortalToken(token: string, now = Date.now()): PortalCheck {
  const parts = token.split('.')
  if (parts.length !== 4) return { ok: false, reason: 'invalid' }
  const [studentId, exp, ver, sig] = parts
  const expect = sign(`${studentId}.${exp}.${ver}`)
  const a = Buffer.from(sig), b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' }
  const expiresAt = parseInt(exp, 36) * 1000
  if (!Number.isFinite(expiresAt) || expiresAt < now) return { ok: false, reason: 'expired' }
  return { ok: true, studentId, version: Number(ver), expiresAt }
}
