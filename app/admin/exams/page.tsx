import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin'
import { examKey, listExamMaps, listTestTitles } from '@/lib/kakao/store'
import { createExamMapAction } from '../actions'
import '../admin.css'

export const dynamic = 'force-dynamic'
// 시험지 AI 분석이 1~2분 걸릴 수 있다
export const maxDuration = 300
export const metadata: Metadata = { title: 'AWESOME 시험지 문항 연결', robots: { index: false, follow: false } }

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isAdmin())) redirect('/admin')
  const sp = await searchParams
  const [maps, titles] = await Promise.all([listExamMaps(), listTestTitles()])
  const mapped = new Set(maps.map(m => m.id))

  return (
    <main className="adm">
      <header className="top"><h1>시험지 문항 연결</h1><Link href="/admin" className="ghostlink">← 학생 관리</Link></header>
      {sp.error && <p className="err">{sp.error}</p>}

      <section className="card">
        <h2>새 시험지</h2>
        <p className="hint">시험지 PDF를 올리면 AI가 문항마다 세부 단원 초안을 만들고, 선생님이 확인한 뒤 확정합니다. 확정하면 그 시험에서 학생이 틀린 문항이 세부 단원으로 진단표에 들어갑니다. 분석에 1~2분 걸릴 수 있습니다.</p>
        <form action={createExamMapAction} className="grid">
          <label>패스드림 시험명 (가져온 결과에서 선택)
            <select name="title" required defaultValue="">
              <option value="" disabled>선택</option>
              {titles.map(t => <option key={t.key} value={t.title}>{t.title}{mapped.has(examKey(t.title)) ? ' (연결 있음)' : ''}</option>)}
            </select>
          </label>
          <label>문항 범위<input name="range" defaultValue="1-22" /></label>
          <label>시험지 PDF<input type="file" name="file" accept="application/pdf" /></label>
          <button name="mode" value="ai">AI 초안 만들기</button>
          <button name="mode" value="manual" className="ghost">직접 입력</button>
        </form>
        {titles.length === 0 && <p className="hint">먼저 학생 관리 화면에서 패스드림 결과 PDF를 가져오세요. 시험명은 그 결과에서 고릅니다.</p>}
      </section>

      <section className="card">
        <h2>연결된 시험 {maps.length}개</h2>
        <table>
          <thead><tr><th>시험명</th><th>상태</th><th>문항</th><th>단원 지정</th><th>초안</th></tr></thead>
          <tbody>
            {maps.map(m => (
              <tr key={m.id}>
                <td><a href={`/admin/exams/${encodeURIComponent(m.id)}`}>{m.title}</a><div className="hint">{m.source}</div></td>
                <td>{m.status === 'confirmed' ? <span className="ok">확정</span> : '초안'}</td>
                <td className="num">{m.items.length}</td>
                <td className="num">{m.items.filter(i => i.topic_code).length}</td>
                <td className="hint">{m.model === 'manual' ? '직접 입력' : 'AI'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
