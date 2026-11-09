// 관리자(운영자 1인) 인증 — ADMIN_PASSWORD 하나로 로그인하고, 서명된 쿠키로 유지한다.
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE = 'aw_admin'

function token(): string | null {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) return null
  return createHmac('sha256', pw).update('awesome-admin-v1').digest('hex')
}

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function isAdmin(): Promise<boolean> {
  const t = token()
  if (!t) return false
  const c = (await cookies()).get(COOKIE)?.value
  return !!c && same(c, t)
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('관리자 로그인이 필요합니다.')
}

export async function login(password: string): Promise<boolean> {
  const pw = process.env.ADMIN_PASSWORD
  const t = token()
  if (!pw || !t || !same(password, pw)) return false
  ;(await cookies()).set(COOKIE, t, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 14,
  })
  return true
}

export async function logout() {
  ;(await cookies()).delete(COOKIE)
}
