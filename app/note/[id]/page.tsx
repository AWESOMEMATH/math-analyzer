import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getQuestion } from '@/lib/kakao/store'
import { findTopic } from '@/lib/kakao/curriculum'
import { ERROR_TYPE_LABEL } from '@/lib/kakao/types'
import MathText from '../MathText'
import Mascot from '../Mascot'
import Fonts from '../Fonts'
import PrintButton from '../PrintButton'
import 'katex/dist/katex.min.css'
import '../note.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'AWESOME 손글씨 노트', robots: { index: false, follow: false } }

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rec = await getQuestion(id).catch(() => null)
  if (!rec) notFound()
  const n = rec.note
  const t = findTopic(n.topic_code)

  return (
    <main className="awn">
      <Fonts />
      <div className="brand" style={{ justifyContent: 'space-between' }}>
        <span>AWESOME MATH LAB</span>
        <PrintButton />
      </div>
      <h1 className="title">어썸 손글씨 노트</h1>
      <div className="unit">
        {t ? `${t.course} · ${t.chapter} · ${t.topic}` : '단원 분류 확인 중'}
        {n.topic_confidence === 'low' && ' (분류 불확실)'}
      </div>

      <div className="why"><span className="tag">왜 이 문제?</span><MathText text={n.why} className="hand" /></div>

      <div className="row">
        <Mascot mood="smile" arm="right" size={72} />
        <div className="box prob">
          <div className="lab">문제</div>
          <MathText text={n.problem} />
        </div>
      </div>

      {n.has_student_work && (
        <div className={`box ${n.student_verdict === 'wrong' ? 'trap' : 'check'}`}>
          <div className={`verdict ${n.student_verdict === 'wrong' ? 'ng' : 'ok'}`}>
            {n.student_verdict === 'wrong' ? `내 풀이 점검 — ${ERROR_TYPE_LABEL[n.error_type]}` : '내 풀이 점검 — 맞았습니다'}
          </div>
          <MathText text={n.student_feedback} className="hand" />
        </div>
      )}

      {n.steps.map((s, i) => (
        <section className="step" key={i}>
          <h3><span className="n">STEP {i + 1}</span>{s.title}</h3>
          <MathText text={s.body} className="hand" />
        </section>
      ))}

      {n.bubble && (
        <div className="row" style={{ alignItems: 'center' }}>
          <Mascot mood="oh" size={64} />
          <div className="bubble">{n.bubble}</div>
        </div>
      )}

      {n.check && (
        <div className="row">
          <Mascot mood="smile" arm="up" size={64} />
          <div className="box check">
            <div className="boxlab">수학적으로 확실하게 — 그림만 보고 끝내지 않기</div>
            <MathText text={n.check} className="hand" />
          </div>
        </div>
      )}

      {n.pitfall && (
        <div className="row">
          <Mascot mood="pout" arm="right" size={64} />
          <div className="box trap">
            <div className="boxlab">자주 틀리는 지점</div>
            <MathText text={n.pitfall} className="hand" />
          </div>
        </div>
      )}

      <div className="stamp">정답 <MathText text={n.answer} className="hand" /></div>

      {n.summary.length > 0 && (
        <div className="row">
          <div className="box sum">
            <div className="tb">AWESOME SUMMARY</div>
            <ol>{n.summary.map((s, i) => <li key={i}><MathText text={s} className="hand" /></li>)}</ol>
          </div>
          <Mascot mood="wink" size={64} />
        </div>
      )}

      <div className="foot">
        AI가 작성한 풀이입니다. 이상한 부분은 선생님께 꼭 다시 물어보세요. · {new Date(rec.createdAt).toLocaleDateString('ko-KR')}
      </div>
    </main>
  )
}
