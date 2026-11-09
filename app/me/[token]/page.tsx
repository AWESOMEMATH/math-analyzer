import type { Metadata } from 'next'
import { verifyPortalToken } from '@/lib/portal'
import { CYCLE_MS, getAcademy, getStudent, listReports, recentQuestions, recentTestResults } from '@/lib/kakao/store'
import { findTopic } from '@/lib/kakao/curriculum'
import { loadExamMaps } from '@/lib/kakao/diagnosis'
import { examKey } from '@/lib/kakao/store'
import { curriculumOf } from '@/lib/kakao/exam'
import { ERROR_TYPE_LABEL } from '@/lib/kakao/types'
import Mascot from '../../note/Mascot'
import Fonts from '../../note/Fonts'
import '../../note/note.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'AWESOME 내 학습 기록',
  robots: { index: false, follow: false },
  // 주소에 든 토큰이 외부 글꼴 요청 등으로 새지 않게 한다
  referrer: 'no-referrer',
}

const ymd = (ms: number) => new Date(ms).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

function daysUntilDiagnosis(cycleStart: number | null): number | null {
  return cycleStart ? Math.max(0, Math.ceil((cycleStart + CYCLE_MS - Date.now()) / 86400000)) : null
}

function Closed({ text }: { text: string }) {
  return (
    <main className="awn">
      <Fonts />
      <div className="brand">AWESOME MATH LAB</div>
      <h1 className="title">내 학습 기록</h1>
      <div className="row" style={{ alignItems: 'center' }}>
        <Mascot mood="pout" size={72} />
        <div className="bubble">{text}</div>
      </div>
    </main>
  )
}

export default async function MyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = verifyPortalToken(decodeURIComponent(token))
  if (!v.ok) {
    return <Closed text={v.reason === 'expired'
      ? '링크 사용 기간이 지났어요. 카톡 채널에 「내 기록」을 보내면 새 링크를 받을 수 있어요.'
      : '열 수 없는 링크예요. 카톡 채널에 「내 기록」을 보내 새 링크를 받아 주세요.'} />
  }
  const st = await getStudent(v.studentId)
  if (!st || !st.active || (st.portalVersion ?? 0) !== v.version) {
    return <Closed text="더 이상 쓸 수 없는 링크예요. 카톡 채널에 「내 기록」을 보내 새 링크를 받아 주세요." />
  }

  const [academy, questions, tests, reports] = await Promise.all([
    getAcademy(st.academyId), recentQuestions(st.id), recentTestResults(st.id), listReports(st.id),
  ])
  const maps = await loadExamMaps(tests)
  const wrongLabel = (title: string, no: number) => {
    const m = maps.get(examKey(title))
    const it = m?.status === 'confirmed' ? m.items.find(x => x.no === no) : undefined
    const tp = it ? findTopic(it.topic_code) : undefined
    return tp ? `${no}번 ${tp.topic}` : `${no}번`
  }
  const daysLeft = daysUntilDiagnosis(st.cycleStart)
  const inCycleQ = st.cycleStart ? questions.filter(q => q.createdAt >= st.cycleStart!).length : 0
  const inCycleT = st.cycleStart ? tests.filter(t => t.importedAt >= st.cycleStart!).length : 0

  return (
    <main className="awn awr">
      <Fonts />
      <div className="brand">AWESOME MATH LAB</div>
      <h1 className="title">{st.name}의 학습 기록</h1>
      <div className="unit">
        {academy?.name ?? ''} · {st.status === 'repeat' ? 'N수' : `고${st.grade}`} · {st.targetYear}학년도 수능 ({curriculumOf(st.targetYear)})
      </div>

      <div className="row" style={{ alignItems: 'center' }}>
        <Mascot mood="smile" size={64} />
        <div className="bubble">
          {daysLeft === null
            ? '아직 기록이 없어요. 모르는 문제를 사진으로 보내면 여기에 쌓여요.'
            : `이번 4주에 질문 ${inCycleQ}개, 테스트 ${inCycleT}회가 쌓였어요. 진단까지 ${daysLeft}일 남았어요.`}
        </div>
      </div>

      {reports.length > 0 && (
        <div className="box sum">
          <div className="tb">REPORTS</div>
          <ul>
            {reports.map(r => (
              <li key={r.id}>
                <a href={`/report/${r.id}`}>{ymd(r.periodStart)} ~ {ymd(r.periodEnd)} 진단표</a>
                <span className="caveat"> · 질문 {r.total}건{r.tests?.length ? ` · 테스트 ${r.tests.length}회` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="box">
        <div className="boxlab">학원 테스트</div>
        {tests.length === 0 ? <p className="caveat">아직 가져온 테스트가 없어요.</p> : (
          <div className="tablewrap">
            <table className="compact">
              <thead><tr><th>시험</th><th>점수</th><th>틀린 문항</th></tr></thead>
              <tbody>
                {tests.map(t => (
                  <tr key={t.id}>
                    <td>
                      {t.title}
                      <div className="caveat">{t.submittedAt} · {t.units.map(u => `${u.label} ${u.correct}/${u.items}`).join(', ')}</div>
                    </td>
                    <td className="num">{t.correct}/{t.totalItems}</td>
                    <td>{t.wrongItems.length ? t.wrongItems.map(n => wrongLabel(t.title, n)).join(', ') + (t.wrongComplete ? '' : ' 외') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="box">
        <div className="boxlab">내 질문 노트 (최근 {questions.length}개)</div>
        {questions.length === 0 ? <p className="caveat">아직 질문이 없어요.</p> : (
          <ul style={{ paddingLeft: 18 }}>
            {questions.map(q => {
              const t = findTopic(q.note.topic_code)
              const mark = q.note.student_verdict === 'wrong' ? `❗ ${ERROR_TYPE_LABEL[q.note.error_type]}`
                : q.note.student_verdict === 'correct' ? '✅ 맞음' : ''
              return (
                <li key={q.id} style={{ marginBottom: 4 }}>
                  <a href={`/note/${q.id}`}>{ymd(q.createdAt)} · {t ? `${t.chapter} > ${t.topic}` : '단원 미분류'}</a>
                  {mark && <span className="caveat"> · {mark}</span>}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="foot">
        이 링크는 {new Date(v.expiresAt).toLocaleDateString('ko-KR')}까지 열려요. 다른 사람에게 보내지 마세요.
      </div>
    </main>
  )
}
