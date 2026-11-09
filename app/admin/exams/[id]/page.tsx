import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { isAdmin } from '@/lib/admin'
import { getExamMap, listTestTitles } from '@/lib/kakao/store'
import { loadTopics } from '@/lib/kakao/curriculum'
import { checkAgainstPassdream } from '@/lib/exam/analyze'
import { saveExamMapAction } from '../../actions'
import '../../admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'AWESOME 시험지 문항 연결', robots: { index: false, follow: false } }

export default async function ExamMapPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }>
}) {
  if (!(await isAdmin())) redirect('/admin')
  const { id } = await params
  const sp = await searchParams
  const m = await getExamMap(decodeURIComponent(id))
  if (!m) notFound()
  const pd = (await listTestTitles()).find(t => t.key === m.id)
  const check = pd ? checkAgainstPassdream(m.items, pd.units) : []
  const topics = loadTopics().filter(t => t.level === 'high')
  const courses = [...new Set(topics.map(t => t.course))]

  return (
    <main className="adm">
      <header className="top"><h1>{m.title}</h1><Link href="/admin/exams" className="ghostlink">← 시험 목록</Link></header>
      <p className="hint">{m.status === 'confirmed' ? '확정됨 — 진단표에 반영됩니다. 고쳐서 다시 확정할 수 있습니다.' : '초안 — 확인 후 「확정」을 눌러야 진단표에 반영됩니다.'} {m.model !== 'manual' && 'AI 초안입니다. 문항마다 확인해 주세요.'}</p>
      {sp.error && <p className="err">{sp.error}</p>}
      {sp.saved && <p className="ok">{sp.saved === 'confirmed' ? '확정했습니다.' : '저장했습니다.'}</p>}

      {check.length > 0 && (
        <section className="card">
          <h2>패스드림 단원별 문항 수와 비교</h2>
          <p className="hint">패스드림 리포트의 단원별 문항 수와 이 표의 대단원별 문항 수가 같아야 합니다. 다르면 어느 쪽 분류가 다른지 확인하세요.</p>
          <div className="row">
            {check.map(c => (
              <span key={c.label} className={c.ok ? 'ok' : 'err'} style={{ marginRight: 12 }}>
                {c.ok ? '✓' : '✗'} {c.label} {c.mapped}/{c.expected}
              </span>
            ))}
          </div>
        </section>
      )}

      <form action={saveExamMapAction} className="card">
        <input type="hidden" name="id" value={m.id} />
        <div className="tablewrap">
          <table>
            <thead><tr><th>번호</th><th>배점</th><th>문항 요약</th><th>세부 단원 (2022 개정)</th></tr></thead>
            <tbody>
              {m.items.map(it => (
                <tr key={it.no} className={it.topic_code ? '' : 'warn'}>
                  <td className="num">{it.no}</td>
                  <td className="num">{it.points ?? '-'}</td>
                  <td><input name={`summary_${it.no}`} defaultValue={it.summary} style={{ width: '100%' }} /></td>
                  <td>
                    <select name={`code_${it.no}`} defaultValue={it.topic_code}>
                      <option value="">— 선택 —</option>
                      {courses.map(c => (
                        <optgroup key={c} label={c}>
                          {topics.filter(t => t.course === c).map(t => <option key={t.code} value={t.code}>{t.chapter} &gt; {t.topic}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button name="intent" value="draft" className="ghost">저장</button>
          <button name="intent" value="confirm">확정</button>
        </div>
      </form>
    </main>
  )
}
