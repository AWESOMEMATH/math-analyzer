'use client'
import { useState } from 'react'
import { testAnswerAction, type TestAnswerResult } from '../actions'

const DEADLINE = Number(process.env.NEXT_PUBLIC_KAKAO_DEADLINE_S || 45)

export default function TestAnswer() {
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<TestAnswerResult | null>(null)

  async function run(fd: FormData) {
    setBusy(true); setR(null)
    try { setR(await testAnswerAction(fd)) } catch (e) { setR({ error: e instanceof Error ? e.message : '실패' }) }
    setBusy(false)
  }

  const sec = r?.ms ? r.ms / 1000 : 0
  return (
    <div>
      <form action={run} className="row">
        <input type="file" name="image" accept="image/*" required />
        <button disabled={busy}>{busy ? '풀이 중… (최대 2분)' : '풀이 시험'}</button>
      </form>
      {r?.error && <p className="err">{r.error}</p>}
      {r?.note && (
        <div className="imp">
          <p className={sec <= DEADLINE ? 'ok' : 'err'}>
            응답 {sec.toFixed(1)}초 {sec <= DEADLINE ? '— 카톡 1분 안에 들어옴' : `— ${DEADLINE}초 초과: 학생은 「작성 중」 링크를 먼저 받음`}
          </p>
          <p className="hint">
            {r.model} · 입력 {r.tokens!.input} · 캐시 읽기 {r.tokens!.cacheRead} · 캐시 쓰기 {r.tokens!.cacheWrite} · 출력 {r.tokens!.output} 토큰
            {r.costUsd != null && ` · 약 $${r.costUsd.toFixed(4)} (₩${Math.round(r.costUsd * 1400)})`}
          </p>
          <table>
            <tbody>
              <tr><th>판독</th><td>{r.note.legible ? '읽음' : '읽지 못함'}</td></tr>
              <tr><th>문제</th><td>{r.note.problem}</td></tr>
              <tr><th>단원</th><td>{r.topicLabel} ({r.note.topic_confidence})</td></tr>
              <tr><th>정답</th><td>{r.note.answer}</td></tr>
              <tr><th>학생 풀이</th><td>{r.note.has_student_work ? `${r.note.student_verdict} · ${r.note.error_type} · ${r.note.student_feedback}` : '없음'}</td></tr>
              <tr><th>풀이</th><td>{r.note.steps.map((s, i) => <div key={i}><b>{s.title}</b> {s.body}</div>)}</td></tr>
              <tr><th>함정</th><td>{r.note.pitfall}</td></tr>
            </tbody>
          </table>
          <p className="hint">저장되지 않는 시험입니다. 같은 설정으로 연달아 시험하면 두 번째부터 캐시 읽기가 생겨 입력 비용이 줄어듭니다.</p>
        </div>
      )}
    </div>
  )
}
