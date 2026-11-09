'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { extractLines } from '@/lib/passdream/extract'
import { importPassdreamAction, type ImportSummary } from './actions'

export default function PassdreamImport({ academyId }: { academyId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<ImportSummary | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    if (!files.length) return
    setBusy(true); setRes(null)
    const total: ImportSummary = { saved: [], duplicate: [], unmatched: [], ambiguous: [], warnings: [] }
    try {
      for (const f of files) {
        const r = await importPassdreamAction(academyId, await extractLines(f))
        if (r.error) total.warnings.push(`${f.name}: ${r.error}`)
        total.saved.push(...r.saved); total.duplicate.push(...r.duplicate)
        total.unmatched.push(...r.unmatched); total.ambiguous.push(...r.ambiguous); total.warnings.push(...r.warnings)
      }
      setRes(total)
      if (total.saved.length) router.refresh() // 학생 표의 테스트 수 갱신 (결과 표시는 유지)
    } catch (err) {
      setRes({ ...total, error: err instanceof Error ? err.message : '가져오기 실패' })
    } finally {
      setBusy(false); e.target.value = ''
    }
  }

  return (
    <div>
      <p className="hint">패스드림 「과제 성적분석 리포트」 PDF를 올리면 학생 이름으로 명부와 맞춰 테스트 기록을 저장합니다. 파일은 브라우저에서 읽고 글자만 서버로 보냅니다. 같은 파일을 다시 올려도 중복 저장되지 않습니다.</p>
      <input type="file" accept="application/pdf" multiple onChange={onFile} disabled={busy} />
      {busy && <p className="hint">읽는 중…</p>}
      {res && (
        <div className="imp">
          {res.error && <p className="err">{res.error}</p>}
          <p className="ok">저장 {res.saved.length}건{res.saved.length > 0 && ` — ${res.saved.map(s => `${s.name} ${s.score}`).join(', ')}`}</p>
          {res.duplicate.length > 0 && <p className="hint">이미 있음 {res.duplicate.length}건: {res.duplicate.join(', ')}</p>}
          {res.unmatched.length > 0 && <p className="err">명부에 없는 이름 {res.unmatched.length}명: {res.unmatched.join(', ')} — 이 학원에 학생으로 등록한 뒤 다시 올리세요</p>}
          {res.ambiguous.length > 0 && <p className="err">동명이인이라 건너뜀: {res.ambiguous.join(', ')}</p>}
          {res.warnings.length > 0 && <ul className="hint">{res.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}
