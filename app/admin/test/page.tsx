import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin'
import { checkConfig } from '@/lib/config'
import TestAnswer from './TestAnswer'
import '../admin.css'

export const dynamic = 'force-dynamic'
// 실제 풀이 시험이 1분을 넘을 수 있다
export const maxDuration = 300
export const metadata: Metadata = { title: 'AWESOME 배포 점검', robots: { index: false, follow: false } }

export default async function TestPage() {
  if (!(await isAdmin())) redirect('/admin')
  const cfg = checkConfig()
  return (
    <main className="adm">
      <header className="top"><h1>배포 점검</h1><Link href="/admin" className="ghostlink">← 학생 관리</Link></header>
      <section className="card">
        <h2>환경변수</h2>
        <p className="hint">값은 표시하지 않고 설정 여부만 확인합니다.</p>
        <table>
          <tbody>
            {cfg.map(c => (
              <tr key={c.name}>
                <td className={c.ok ? 'ok' : c.required ? 'err' : 'hint'}>{c.ok ? '✓' : c.required ? '✗' : '–'}</td>
                <td><code>{c.name}</code>{c.required && !c.ok && <b className="err"> 필수</b>}</td>
                <td className="hint">{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>실제 풀이 시험</h2>
        <p className="hint">카톡 없이 같은 풀이 과정을 돌려 응답 시간·비용·풀이 품질을 확인합니다. 정답을 아는 문제 사진으로 시험하세요.</p>
        <TestAnswer />
      </section>
    </main>
  )
}
