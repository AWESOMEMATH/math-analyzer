import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getReport } from '@/lib/kakao/store'
import { ERROR_TYPE_LABEL, type ErrorType } from '@/lib/kakao/types'
import Mascot from '../../note/Mascot'
import Fonts from '../../note/Fonts'
import PrintButton from '../../note/PrintButton'
import 'katex/dist/katex.min.css'
import '../../note/note.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'AWESOME 4주 진단표', robots: { index: false, follow: false } }

const fmt = (ms: number) => new Date(ms).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
const ERR_ORDER: ErrorType[] = ['concept', 'calculation', 'condition', 'strategy']

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await getReport(id).catch(() => null)
  if (!r) notFound()
  const maxAsked = Math.max(1, ...r.stats.map(s => s.asked))
  const s = r.solution

  return (
    <main className="awn awr">
      <Fonts />
      <div className="brand" style={{ justifyContent: 'space-between' }}>
        <span>AWESOME MATH LAB</span>
        <PrintButton />
      </div>
      <h1 className="title">4주 진단표</h1>
      <div className="unit">{fmt(r.periodStart)} ~ {fmt(r.periodEnd)} · 질문 {r.total}건{r.tests?.length ? ` · 학원 테스트 ${r.tests.length}회` : ''} · 2022 개정 교육과정 기준</div>

      <div className="row" style={{ alignItems: 'center' }}>
        <Mascot mood="oh" size={64} />
        <div className="bubble">{s.headline}</div>
      </div>

      {r.stats.length > 0 && <div className="box">
        <div className="boxlab">단원별 질문·오류 현황</div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>단원 (과목 &gt; 대단원 &gt; 토픽)</th><th>질문</th><th>풀이 첨부</th><th>오답</th><th>오류 유형</th></tr>
            </thead>
            <tbody>
              {r.stats.map(st => (
                <tr key={st.code}>
                  <td>{st.label}<div className="bar" style={{ width: `${(st.asked / maxAsked) * 100}%`, marginTop: 4 }} /></td>
                  <td className="num">{st.asked}</td>
                  <td className="num">{st.withWork}</td>
                  <td className="num">{st.wrong}</td>
                  <td>{ERR_ORDER.filter(e => st.errors[e]).map(e => `${ERROR_TYPE_LABEL[e]} ${st.errors[e]}`).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="caveat">
          오류 유형 합계 — {ERR_ORDER.map(e => `${ERROR_TYPE_LABEL[e]} ${r.errorTotals[e] ?? 0}`).join(' · ')}
        </p>
      </div>}

      {r.testStats && r.testStats.length > 0 && (
        <div className="box">
          <div className="boxlab">학원 테스트 단원별 정답률 (패스드림 {r.tests?.length ?? 0}회)</div>
          <div className="tablewrap">
            <table className="compact">
              <thead><tr><th>단원 (2022 개정)</th><th>회</th><th>정답</th><th>정답률</th><th>반평균</th></tr></thead>
              <tbody>
                {r.testStats.map(t => {
                  const rate = t.items ? Math.round((t.correct / t.items) * 100) : 0
                  const cls = t.classTotal ? Math.round((t.classCorrect / t.classTotal) * 100) : null
                  return (
                    <tr key={t.key}>
                      <td>{t.label}<div className="bar" style={{ width: `${100 - rate}%`, marginTop: 4 }} /></td>
                      <td className="num">{t.tests}</td>
                      <td className="num">{t.correct}/{t.items}</td>
                      <td className="num">{rate}%</td>
                      <td className="num">{cls === null ? '-' : `${cls}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {r.tests && <p className="caveat">반영한 시험 — {r.tests.map(t => `${t.title} (${t.submittedAt}, ${t.score})`).join(' · ')}</p>}
          <p className="caveat">빨간 막대는 틀린 비율입니다.</p>
        </div>
      )}

      <div className="row">
        <Mascot mood="pout" arm="right" size={64} />
        <div className="box trap">
          <div className="boxlab">우선 보완 단원</div>
          <ol>
            {s.priorities.map(p => (
              <li key={p.code} style={{ marginBottom: 6 }}>
                <b>{p.label}</b><br />{p.reason}<br /><span style={{ background: 'var(--hl)' }}>{p.action}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {s.prerequisites.length > 0 && (
        <div className="row">
          <Mascot mood="smile" arm="up" size={64} />
          <div className="box check">
            <div className="boxlab">먼저 점검할 선수 단원</div>
            <ul>{s.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="box sum">
        <div className="tb">4 WEEKS SOLUTION</div>
        {s.weekly_plan.map(w => (
          <div className="week" key={w.week}>
            <b>{w.week}주차</b>{w.focus}
            <ul>{w.tasks.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        ))}
        {s.habit && <p><span className="tag">풀이 습관</span>{s.habit}</p>}
      </div>

      <div className="box">
        <div className="boxlab">이 진단표를 읽을 때</div>
        <ul className="caveat">{r.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </div>
      <div className="foot">AI 집계·처방입니다. 최종 판단은 담당 선생님과 상의하세요.</div>
    </main>
  )
}
