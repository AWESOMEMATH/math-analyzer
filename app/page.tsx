'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

// ── 타입 정의 ──────────────────────────────────────────────
interface UploadedFile {
  file: File
  preview: string
  probNum: string
}

interface AnalysisResult {
  _index: number
  _probNum: string
  _previewSrc: string
  _analysisMode: 'error' | 'solve'
  _ocr?: string
  _ocrEngine?: string
  _error?: string
  // 오답분석
  error_type?: string
  steps?: Array<{ step: number; content: string; is_correct: boolean }>
  error_location?: string
  error_explanation?: string
  correct_solution?: string
  correct_direction?: string
  good_points?: string
  encouragement?: string
  // 직접풀이
  mode?: string
  problem_understanding?: string
  full_solution?: string
  final_answer?: string
  core_concept?: string
  // 사용량
  used?: number
  limit?: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface HistoryItem {
  id: string
  studentName: string
  problemNumber: string
  errorType: string
  errorExplanation: string
  date: string
}

// ── 수식 렌더링 컴포넌트 ──────────────────────────────────────
function MathContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {content || '-'}
    </ReactMarkdown>
  )
}

// ── 결과 섹션 컴포넌트 ──────────────────────────────────────
function ResultSection({
  title, content, accent = '#00d4ff', preWrap = false
}: { title: string; content?: string; accent?: string; preWrap?: boolean }) {
  if (!content) return null
  return (
    <div style={{
      background: '#162032', borderRadius: 10, padding: '16px',
      marginBottom: 12, borderLeft: `3px solid ${accent}`
    }}>
      <h3 style={{
        fontSize: 12, fontWeight: 600, color: accent,
        letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10
      }}>{title}</h3>
      <div style={{
        fontSize: 15, lineHeight: 1.7, color: '#e0e1dd',
        whiteSpace: preWrap ? 'pre-wrap' : undefined
      }}>
        <MathContent content={content} />
      </div>
    </div>
  )
}

// ── 단계별 분석 컴포넌트 ──────────────────────────────────────
function StepsSection({ steps }: { steps?: Array<{ step: number; content: string; is_correct: boolean }> }) {
  if (!steps || steps.length === 0) return null
  return (
    <div style={{ background: '#162032', borderRadius: 10, padding: 16, marginBottom: 12, borderLeft: '3px solid #00d4ff' }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, color: '#00d4ff', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
        단계별 풀이 분석
      </h3>
      {steps.map(s => (
        <div key={s.step} style={{
          padding: '10px 12px', borderRadius: 6, marginBottom: 8,
          background: s.is_correct ? 'rgba(255,255,255,0.03)' : 'rgba(255,68,68,0.1)',
          border: `1px solid ${s.is_correct ? '#2d3f55' : 'rgba(255,68,68,0.3)'}`,
          fontSize: 14, display: 'flex', alignItems: 'flex-start', gap: 10
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 6px', borderRadius: 4, whiteSpace: 'nowrap',
            background: s.is_correct ? '#00cc66' : '#ff4444',
            color: s.is_correct ? '#000' : '#fff'
          }}>{s.is_correct ? '정상' : '오류'}</span>
          <div style={{ lineHeight: 1.5, flex: 1 }}>
            <strong>단계 {s.step}:</strong> <MathContent content={s.content} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── OCR 섹션 컴포넌트 (접기/펼치기) ──────────────────────────
function OcrSection({ ocrText, ocrEngine }: { ocrText: string; ocrEngine?: string }) {
  const [open, setOpen] = useState(false)
  const badge = ocrEngine === 'Mathpix'
    ? <span style={{ background: '#00b386', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>📐 Mathpix</span>
    : <span style={{ background: '#6c5ce7', color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>🤖 Claude Vision</span>
  return (
    <div style={{ background: '#162032', borderRadius: 10, padding: 16, marginBottom: 12, borderLeft: '3px solid #2d3f55' }}>
      <h3
        style={{ fontSize: 12, fontWeight: 600, color: '#778da9', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        onClick={() => setOpen(v => !v)}
      >
        📝 손글씨 판독 원문 {badge}
        <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 'auto' }}>{open ? '▲ 접기' : '▼ 펼치기'}</span>
      </h3>
      {open && (
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#a0c4d8', lineHeight: 1.7, marginTop: 8 }}>
          {ocrText}
        </pre>
      )}
    </div>
  )
}

// ── 이미지 리사이즈 ──────────────────────────────────────────
async function resizeImage(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        const MIN = 1000, MAX = 2000
        if (Math.max(w, h) < MIN) {
          if (w > h) { h = Math.round(h * MIN / w); w = MIN }
          else { w = Math.round(w * MIN / h); h = MIN }
        } else if (Math.max(w, h) > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else { w = Math.round(w * MAX / h); h = MAX }
        }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        let data = canvas.toDataURL('image/png')
        let mediaType = 'image/png'
        if (data.length > 1500000) {
          let q = 0.92
          data = canvas.toDataURL('image/jpeg', q)
          mediaType = 'image/jpeg'
          while (data.length > 1200000 && q > 0.3) { q -= 0.08; data = canvas.toDataURL('image/jpeg', q) }
        }
        resolve({ base64: data.split(',')[1], mediaType })
      }
      img.onerror = reject
    }
  })
}

// ── 쿠키 유틸 ──────────────────────────────────────────────
function setCookie(name: string, value: string, days: number) {
  const expires = days > 0 ? `; expires=${new Date(Date.now() + days * 864e5).toUTCString()}` : ''
  document.cookie = `${name}=${value}${expires}; path=/`
}
function getCookie(name: string): string {
  return document.cookie.split('; ').find(r => r.startsWith(name + '='))?.split('=')[1] || ''
}

// ════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ════════════════════════════════════════════════════════════
export default function Home() {
  // ── 인증 ──
  const [inviteCode, setInviteCode] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authError, setAuthError] = useState('')

  // ── 설정 패널 ──
  const [showSettings, setShowSettings] = useState(false)

  // ── 업로드 ──
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [analysisMode, setAnalysisMode] = useState<'error' | 'solve'>('error')
  const [studentName, setStudentName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 분석 진행 ──
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' })
  const [error, setError] = useState('')

  // ── 결과 ──
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [usageInfo, setUsageInfo] = useState<{ used: number; limit: number } | null>(null)
  const [showBulkExport, setShowBulkExport] = useState(false)

  // ── 이력 ──
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())

  // ── 채팅 ──
  const [chatHistories, setChatHistories] = useState<Record<number, ChatMessage[]>>({})
  const [chatInputs, setChatInputs] = useState<Record<number, string>>({})
  const [chatLoading, setChatLoading] = useState<Record<number, boolean>>({})
  const chatBoxRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // ── 초대 코드 복원 ──
  useEffect(() => {
    let saved = getCookie('invite_code')
    if (saved) { try { saved = decodeURIComponent(saved) } catch {} }
    if (!saved) saved = localStorage.getItem('aml_invite_code') || ''
    if (saved) { setInviteCode(saved); setIsAuthenticated(true) }
  }, [])

  // ── 클립보드 붙여넣기 ──
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile()
          if (f) { addFiles([f]); e.preventDefault(); break }
        }
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [uploadedFiles])

  // ── Firebase 이력 로드 ──
  useEffect(() => { if (isAuthenticated) loadHistory() }, [isAuthenticated])

  // ── 인증 처리 ──
  const handleAuth = async () => {
    if (!inviteCode.trim()) { setAuthError('초대 코드를 입력해주세요.'); return }
    
    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() })
      })
      
      if (res.ok) {
        localStorage.setItem('aml_invite_code', inviteCode.trim())
        setIsAuthenticated(true)
        setAuthError('')
      } else {
        setAuthError('유효하지 않은 초대 코드입니다.')
      }
    } catch {
      setAuthError('인증 서버와 통신할 수 없습니다.')
    }
  }

  // ── 파일 추가 ──
  const addFiles = useCallback((files: FileList | File[]) => {
    const MAX = 5
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    const remaining = MAX - uploadedFiles.length
    const toAdd = arr.slice(0, remaining)
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        setUploadedFiles(prev => [
          ...prev,
          { file, preview: e.target?.result as string, probNum: '' }
        ])
      }
      reader.readAsDataURL(file)
    })
  }, [uploadedFiles.length])

  // ── 파일 제거 ──
  const removeFile = (i: number) => {
    setUploadedFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── 문제번호 수정 ──
  const updateProbNum = (i: number, val: string) => {
    setUploadedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, probNum: val } : f))
  }

  // ── 분석 실행 ──
  const handleAnalyze = async (isPremium: boolean = false) => {
    if (!studentName.trim()) { setError('학생 이름을 입력해주세요.'); return }
    if (uploadedFiles.length === 0) { setError('풀이 사진을 선택해주세요.'); return }
    setIsAnalyzing(true)
    setResults([])
    setError('')
    setShowBulkExport(false)
    const total = uploadedFiles.length
    const newResults: AnalysisResult[] = []

    for (let i = 0; i < total; i++) {
      const item = uploadedFiles[i]
      const probNum = item.probNum.trim() || `문제 ${i + 1}`
      setProgress({ current: i + 1, total, msg: `📷 ${i + 1}/${total} 이미지 판독 중...` })
      try {
        const { base64, mediaType } = await resizeImage(item.file)
        setProgress({ current: i + 1, total, msg: `🔍 ${i + 1}/${total} 분석 중...` })
        const res = await fetch(isPremium ? '/api/analyze-premium' : '/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-invite-code': encodeURIComponent(inviteCode) },
          body: JSON.stringify({ base64Image: base64, mediaType, problemNum: probNum, analysisMode })
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `서버 오류 (${res.status})`)
        }
        const data = await res.json()
        if (data.used !== undefined) setUsageInfo({ used: data.used, limit: data.limit })
        newResults.push({ ...data, _index: i, _probNum: probNum, _previewSrc: item.preview, _analysisMode: analysisMode })
      } catch (err: unknown) {
        newResults.push({
          _error: err instanceof Error ? err.message : '분석 실패',
          _index: i, _probNum: probNum, _previewSrc: item.preview, _analysisMode: analysisMode
        })
      }
    }

    setResults(newResults)
    setProgress({ current: total, total, msg: `✅ ${total}개 문제 분석 완료!` })
    setIsAnalyzing(false)
    if (newResults.some(r => !r._error)) setShowBulkExport(true)
    await saveHistoryBatch(studentName, newResults)
    await loadHistory()
  }

  // ── Firebase 이력 ──
  const saveHistoryBatch = async (name: string, items: AnalysisResult[]) => {
    try {
      const { db } = await import('@/lib/firebase')
      if (!db) return
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore')
      for (const r of items) {
        if (r._error) continue
        const isSolve = r._analysisMode === 'solve'
        await addDoc(collection(db, 'analyses'), {
          studentName: name, problemNumber: r._probNum,
          errorType: isSolve ? '문제풀이' : (r.error_type || ''),
          errorExplanation: isSolve ? (r.problem_understanding || '') : (r.error_explanation || ''),
          correctSolution: isSolve ? (r.full_solution || '') + '\n정답: ' + (r.final_answer || '') : (r.correct_solution || ''),
          encouragement: r.encouragement || '', timestamp: serverTimestamp()
        })
      }
    } catch {}
  }

  const loadHistory = async () => {
    try {
      const { db } = await import('@/lib/firebase')
      if (!db) return
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore')
      const snap = await getDocs(query(collection(db, 'analyses'), orderBy('timestamp', 'desc')))
      const items: HistoryItem[] = snap.docs.map(doc => {
        const d = doc.data()
        let date = ''
        if (d.timestamp) { const dt = d.timestamp.toDate(); date = `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}` }
        return { id: doc.id, studentName: d.studentName, problemNumber: d.problemNumber, errorType: d.errorType, errorExplanation: d.errorExplanation, date }
      })
      setHistory(items)
    } catch {}
  }

  // ── 채팅 ──
  const sendChat = async (cardIndex: number) => {
    const text = chatInputs[cardIndex]?.trim()
    if (!text || chatLoading[cardIndex]) return
    const history: ChatMessage[] = [...(chatHistories[cardIndex] || []), { role: 'user', content: text }]
    setChatHistories(prev => ({ ...prev, [cardIndex]: history }))
    setChatInputs(prev => ({ ...prev, [cardIndex]: '' }))
    setChatLoading(prev => ({ ...prev, [cardIndex]: true }))
    setTimeout(() => { const el = chatBoxRefs.current[cardIndex]; if (el) el.scrollTop = el.scrollHeight }, 50)
    try {
      // 1. 토큰 초과 방지: Context에서 이미지 데이터 및 긴 문자열 제거
      const cleanContext = { ...results[cardIndex] } as Record<string, any>
      Object.keys(cleanContext).forEach(key => {
        if (typeof cleanContext[key] === 'string' && cleanContext[key].length > 1000) {
          delete cleanContext[key]
        }
      })

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invite-code': encodeURIComponent(inviteCode) },
        body: JSON.stringify({ chatHistory: history, analysisContext: cleanContext })
      })
      const data = await res.json().catch(() => ({}))
      
      if (res.ok && data.text) {
        setChatHistories(prev => ({ ...prev, [cardIndex]: [...history, { role: 'assistant', content: data.text }] }))
      } else {
        setChatHistories(prev => ({ ...prev, [cardIndex]: [...history, { role: 'assistant', content: `[오류 발생] ${data.error || '답변을 생성하지 못했습니다.'}` }] }))
      }
    } catch (err) {
      setChatHistories(prev => ({ ...prev, [cardIndex]: [...history, { role: 'assistant', content: `[통신 오류] 서버와 연결할 수 없습니다.` }] }))
    } finally {
      setChatLoading(prev => ({ ...prev, [cardIndex]: false }))
      setTimeout(() => { const el = chatBoxRefs.current[cardIndex]; if (el) el.scrollTop = el.scrollHeight }, 50)
    }
  }

  // ── 내보내기 ──
  const downloadCardAsImage = async (index: number, probNum: string) => {
    const card = document.getElementById(`result-card-${index}`)
    if (!card) return
    const hideEls = card.querySelectorAll<HTMLElement>('.chat-container, .export-bar')
    hideEls.forEach(el => el.style.display = 'none')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const canvas = await (window as any).html2canvas(card, { backgroundColor: '#1b263b', scale: 2, useCORS: true })
      const a = document.createElement('a')
      a.download = `분석결과_${probNum}_${Date.now()}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch (e) { alert('이미지 저장 실패') }
    hideEls.forEach(el => el.style.display = '')
  }

  const downloadCardAsPDF = async (index: number, probNum: string) => {
    const card = document.getElementById(`result-card-${index}`)
    if (!card) return
    const hideEls = card.querySelectorAll<HTMLElement>('.chat-container, .export-bar')
    hideEls.forEach(el => el.style.display = 'none')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).html2pdf().set({
        margin: [10, 10, 10, 10], filename: `분석결과_${probNum}_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#1b263b', useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(card).save()
    } catch { alert('PDF 저장 실패') }
    hideEls.forEach(el => el.style.display = '')
  }

  const downloadAllAsImages = async () => {
    for (const r of results) {
      if (!r._error) { await downloadCardAsImage(r._index, r._probNum); await new Promise(res => setTimeout(res, 500)) }
    }
  }

  const downloadAllAsPDF = async () => {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'background:#1b263b;padding:20px;'
    results.forEach((r) => {
      const card = document.getElementById(`result-card-${r._index}`)
      if (!card) return
      const clone = card.cloneNode(true) as HTMLElement
      clone.querySelectorAll<HTMLElement>('.chat-container, .export-bar').forEach(el => el.remove())
      clone.style.marginBottom = '24px'
      wrapper.appendChild(clone)
    })
    document.body.appendChild(wrapper)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).html2pdf().set({
        margin: [10, 10, 10, 10], filename: `전체분석결과_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, backgroundColor: '#1b263b', useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(wrapper).save()
    } catch { alert('전체 PDF 저장 실패') }
    document.body.removeChild(wrapper)
  }

  // ── 배지 ──
  const getBadge = (r: AnalysisResult): { cls: string; label: string } => {
    if (r._error) return { cls: '#ff4444', label: '분석 실패' }
    if (r._analysisMode === 'solve') return { cls: '#00cc66', label: '💡 직접 풀이 완료' }
    const map: Record<string, string> = { '논리오류': '#ff4444', '계산실수': '#ff8c00', '독해오류': '#ffd700', '정답': '#00cc66' }
    return { cls: map[r.error_type || ''] || '#00cc66', label: r.error_type || '정답' }
  }

  // ══════════════════════════════════════════════════════════
  // 미인증 화면
  // ══════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0d1b2a 0%, #0a1628 100%)', padding: 16 }}>
        <div style={{ border: '1px solid rgba(0,212,255,0.2)', borderRadius: 16, padding: '48px 40px', background: 'rgba(0,212,255,0.03)', backdropFilter: 'blur(12px)', maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#778da9', textTransform: 'uppercase', marginBottom: 8 }}>Awesome Math Lab · 정현경 연구실</div>
          <h1 style={{ color: '#00d4ff', fontFamily: 'monospace', fontSize: '1.6rem', marginBottom: 8, fontWeight: 700 }}>AI 수학 오답 분석기</h1>
          <p style={{ color: '#778da9', fontSize: '0.9rem', marginBottom: 32 }}>초대 코드를 입력하여 입장하세요</p>
          <input
            type="password" placeholder="초대 코드 입력" value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
            style={{ width: '100%', padding: '12px 16px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, color: '#e0e1dd', fontSize: '1rem', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
          />
          {authError && <p style={{ color: '#ff4444', fontSize: 13, marginBottom: 12 }}>{authError}</p>}
          <button onClick={handleAuth} style={{ width: '100%', padding: 13, background: 'linear-gradient(90deg, #0066cc, #00d4ff)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            입장하기
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  // 메인 UI
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ background: '#0d1b2a', color: '#e0e1dd', minHeight: '100vh', padding: '24px 16px 60px', fontFamily: "'Segoe UI', sans-serif" }}>

      {/* 사용량 배지 */}
      {usageInfo && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(10,20,40,0.95)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: '8px 16px', color: '#00d4ff', fontSize: '0.8rem', fontFamily: 'monospace', zIndex: 100 }}>
          이번 달: {usageInfo.used} / {usageInfo.limit} 문항
          <div style={{ height: 3, marginTop: 5, background: '#0d2030', borderRadius: 2 }}>
            <div style={{ height: '100%', borderRadius: 2, background: usageInfo.used / usageInfo.limit > 0.8 ? '#ff4466' : '#00d4ff', width: `${(usageInfo.used / usageInfo.limit) * 100}%`, transition: 'width 0.5s' }} />
          </div>
        </div>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ textAlign: 'center', padding: '32px 0 28px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#778da9', textTransform: 'uppercase', marginBottom: 10 }}>Awesome Math Lab · 정현경 연구실</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#00d4ff' }}>AI 수학 오답 분석기</h1>
          <p style={{ fontSize: 14, color: '#778da9', marginTop: 8 }}>학생 풀이 사진을 업로드하면 AI가 오류 유형을 분석하고 오답노트를 생성합니다</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button onClick={() => setShowSettings(v => !v)} style={{ background: 'transparent', border: '1px solid #2d3f55', color: '#00d4ff', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>
              ⚙️ 설정
            </button>
            <button onClick={() => { setCookie('invite_code', '', -1); localStorage.removeItem('aml_invite_code'); setIsAuthenticated(false) }} style={{ background: 'transparent', border: '1px solid #2d3f55', color: '#778da9', padding: '6px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13 }}>
              🚪 로그아웃
            </button>
          </div>
        </div>

        {/* 설정 패널 */}
        {showSettings && (
          <div style={{ background: '#1b263b', borderRadius: 14, padding: 24, marginBottom: 20, border: '1px solid #2d3f55' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 3, height: 14, background: '#00d4ff', borderRadius: 2 }} />
              ⚙️ 설정
            </div>
            <div style={{ background: '#0a1628', borderRadius: 8, padding: '12px 16px', marginBottom: 12, border: '1px solid #2d3f55' }}>
              <p style={{ fontSize: 12, color: '#778da9' }}>현재 초대 코드: <span style={{ color: '#00d4ff', fontFamily: 'monospace' }}>{inviteCode ? '••••••••' : '미설정'}</span></p>
              <p style={{ fontSize: 12, color: '#778da9', marginTop: 4 }}>변경하려면 로그아웃 후 재입력하세요.</p>
            </div>
            <button onClick={() => setShowSettings(false)} style={{ background: '#00d4ff', color: '#0d1b2a', border: 'none', padding: '10px 24px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>닫기</button>
          </div>
        )}

        {/* 입력 카드 */}
        <div style={{ background: '#1b263b', borderRadius: 14, padding: 24, marginBottom: 20, border: '1px solid #2d3f55' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 3, height: 14, background: '#00d4ff', borderRadius: 2 }} />
            풀이 정보 입력
            <span style={{ fontSize: 11, color: '#778da9', textTransform: 'none', letterSpacing: 0 }}>— 최대 5장 동시 분석</span>
          </div>

          {/* 분석 모드 */}
          <div style={{ background: 'rgba(0,212,255,0.05)', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(0,212,255,0.2)', marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#00d4ff', fontWeight: 600, display: 'block', marginBottom: 10 }}>분석 모드 선택</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {(['error', 'solve'] as const).map(mode => (
                <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#e0e1dd' }}>
                  <input type="radio" name="mode" checked={analysisMode === mode} onChange={() => setAnalysisMode(mode)} />
                  {mode === 'error' ? '오답 분석 👨‍🏫' : '직접 풀이 💡'}
                </label>
              ))}
            </div>
          </div>

          {/* 학생 이름 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#778da9', marginBottom: 7 }}>학생 이름</label>
            <input
              type="text" placeholder="예: 홍길동" value={studentName}
              onChange={e => setStudentName(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', background: '#0f1e2f', border: '1px solid #2d3f55', borderRadius: 8, color: '#e0e1dd', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* 업로드 영역 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#778da9', marginBottom: 7 }}>수학 풀이 사진 (최대 5장)</label>
            <div
              style={{ border: `1.5px dashed ${isDragOver ? '#00d4ff' : '#2d3f55'}`, borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', position: 'relative', background: isDragOver ? 'rgba(0,212,255,0.04)' : 'transparent', transition: 'all 0.2s' }}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) addFiles(e.target.files) }} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
              <div style={{ fontSize: 14, color: '#778da9' }}>
                <strong style={{ color: '#00d4ff' }}>클릭하여 사진 선택 (여러 장 가능)</strong> 혹은 드래그 앤 드롭<br />또는 Ctrl+V로 붙여넣기
              </div>
            </div>
          </div>

          {/* 미리보기 그리드 */}
          {uploadedFiles.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
              {uploadedFiles.map((item, i) => (
                <div key={i} style={{ position: 'relative', background: '#0f1e2f', borderRadius: 8, border: '1px solid #2d3f55', padding: 8 }}>
                  <img src={item.preview} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                  <input
                    type="text" placeholder="문제번호" value={item.probNum}
                    onChange={e => updateProbNum(i, e.target.value)}
                    style={{ width: '100%', marginTop: 6, padding: '4px 8px', background: '#0d1b2a', border: '1px solid #2d3f55', borderRadius: 4, color: '#e0e1dd', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                    onClick={e => e.stopPropagation()}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); removeFile(i) }}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,68,68,0.8)', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* 분석 버튼 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            <button
              onClick={() => handleAnalyze(false)} disabled={isAnalyzing}
              style={{ width: '100%', padding: 15, background: isAnalyzing ? 'rgba(0,212,255,0.3)' : '#00d4ff', color: '#0d1b2a', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: isAnalyzing ? 'not-allowed' : 'pointer' }}
            >
              {isAnalyzing ? '분석 중...' : '분석 시작'}
            </button>
            <button
              onClick={() => handleAnalyze(true)} disabled={isAnalyzing}
              className={`px-4 py-2 rounded-lg border-2 border-cyan-600 text-cyan-400 bg-transparent text-sm font-bold transition-all ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-cyan-900/40 cursor-pointer'}`}
              title="교육과정 기반 정밀 분석"
            >
              {isAnalyzing ? '분석 중...' : '🔬 정밀 분석'}
            </button>
          </div>

          {/* 프로그레스 */}
          {isAnalyzing && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#00d4ff', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
              <p style={{ textAlign: 'center', fontSize: 14, color: '#00d4ff', marginBottom: 8 }}>{progress.msg}</p>
              <div style={{ background: '#2d3f55', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{ background: '#00d4ff', height: '100%', width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`, transition: 'width 0.5s', borderRadius: 6 }} />
              </div>
              <p style={{ fontSize: 12, color: '#778da9', marginTop: 6, textAlign: 'center' }}>{progress.current}/{progress.total} 처리 중</p>
            </div>
          )}

          {!isAnalyzing && progress.msg && (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#00d4ff', marginTop: 10 }}>{progress.msg}</p>
          )}

          {/* 에러 */}
          {error && (
            <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#ff4444', fontSize: 14, marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* 전체 저장 바 */}
        {showBulkExport && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={downloadAllAsImages} style={{ background: 'transparent', border: '1px solid #2d3f55', color: '#00d4ff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>🖼️ 전체 이미지 저장</button>
            <button onClick={downloadAllAsPDF} style={{ background: 'transparent', border: '1px solid #2d3f55', color: '#00d4ff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>📄 전체 PDF 저장</button>
          </div>
        )}

        {/* 결과 카드들 */}
        {results.map(r => {
          const badge = getBadge(r)
          return (
            <div key={r._index} id={`result-card-${r._index}`} style={{ background: '#1b263b', borderRadius: 14, padding: 24, marginBottom: 20, border: '1px solid #2d3f55' }}>

              {/* 카드 헤더 */}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: 3, height: 14, background: '#00d4ff', borderRadius: 2 }} />
                  📄 {r._probNum}
                </span>
                <img src={r._previewSrc} alt="" style={{ height: 40, borderRadius: 4, border: '1px solid #2d3f55', cursor: 'pointer' }}
                  onClick={e => { const img = e.target as HTMLImageElement; img.style.height = img.style.height === '40px' || !img.style.height ? '200px' : '40px' }} />
              </div>

              {/* 배지 */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 14, color: '#0d1b2a', background: badge.cls, marginBottom: 20 }}>
                {badge.label}
              </div>

              {/* OCR 원문 */}
              {r._ocr && <OcrSection ocrText={r._ocr} ocrEngine={r._ocrEngine} />}

              {/* 에러 카드 */}
              {r._error && (
                <div style={{ background: '#162032', borderRadius: 10, padding: 16, borderLeft: '3px solid #ff4444' }}>
                  <p style={{ color: '#ff4444' }}>{r._error}</p>
                </div>
              )}

              {/* 오답 분석 */}
              {!r._error && r._analysisMode === 'error' && (
                <>
                  <StepsSection steps={r.steps} />
                  <ResultSection title="오류 위치" content={r.error_location} accent="#ff4444" />
                  <ResultSection title="오류 설명" content={r.error_explanation} accent="#ff4444" />
                  <ResultSection title="올바른 풀이" content={r.correct_solution} accent="#00cc66" />
                  <ResultSection title="올바른 방향" content={r.correct_direction} accent="#00cc66" />
                  <ResultSection title="잘한 점" content={r.good_points} accent="#ffd700" />
                  <ResultSection title="선생님 한마디" content={r.encouragement} accent="#778da9" />
                </>
              )}

              {/* 직접 풀이 */}
              {!r._error && r._analysisMode === 'solve' && (
                <>
                  <ResultSection title="문제 파악" content={r.problem_understanding} />
                  <ResultSection title="상세 풀이" content={r.full_solution} preWrap />
                  <ResultSection title="최종 정답" content={r.final_answer} accent="#00cc66" />
                  <ResultSection title="핵심 개념" content={r.core_concept} accent="#ffd700" />
                  <ResultSection title="선생님 한마디" content={r.encouragement} accent="#778da9" />
                </>
              )}

              {/* 내보내기 */}
              <div className="export-bar" style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px dashed #2d3f55' }}>
                <button onClick={() => downloadCardAsImage(r._index, r._probNum)} style={{ flex: 1, background: 'transparent', border: '1px solid #2d3f55', color: '#00d4ff', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>🖼️ 이미지 저장</button>
                <button onClick={() => downloadCardAsPDF(r._index, r._probNum)} style={{ flex: 1, background: 'transparent', border: '1px solid #2d3f55', color: '#00d4ff', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>📄 PDF 저장</button>
              </div>

              {/* 개별 채팅 */}
              <div className="chat-container" style={{ borderTop: '1px dashed #2d3f55', marginTop: 24, paddingTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff', marginBottom: 12 }}>💬 이 문제에 대해 질문하세요</div>
                <div ref={el => { chatBoxRefs.current[r._index] = el }} style={{ height: 280, overflowY: 'auto', padding: 14, background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(chatHistories[r._index] || []).map((msg, i) => (
                    <div key={i} style={{
                      maxWidth: '85%', padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5,
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      background: msg.role === 'user' ? '#00d4ff' : '#162032',
                      color: msg.role === 'user' ? '#0d1b2a' : '#e0e1dd',
                      border: msg.role === 'assistant' ? '1px solid #2d3f55' : 'none',
                      borderBottomRightRadius: msg.role === 'user' ? 2 : 12,
                      borderBottomLeftRadius: msg.role === 'assistant' ? 2 : 12,
                    }}>
                      {msg.role === 'assistant' ? <MathContent content={msg.content} /> : msg.content}
                    </div>
                  ))}
                  {chatLoading[r._index] && (
                    <div style={{ alignSelf: 'flex-start', fontSize: 12, color: '#778da9' }}>답변 생성 중...</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={chatInputs[r._index] || ''} placeholder="예: 왜 틀렸는지 더 자세히 설명해줘"
                    onChange={e => setChatInputs(prev => ({ ...prev, [r._index]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && sendChat(r._index)}
                    style={{ flex: 1, padding: '12px 14px', borderRadius: 8, background: '#0f1e2f', border: '1px solid #2d3f55', color: '#e0e1dd', fontSize: 14, outline: 'none' }}
                  />
                  <button onClick={() => sendChat(r._index)} disabled={chatLoading[r._index]} style={{ padding: '0 16px', background: '#00d4ff', color: '#0d1b2a', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    전송
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* 분석 이력 */}
        <div style={{ background: '#1b263b', borderRadius: 14, padding: 24, marginBottom: 20, border: '1px solid #2d3f55' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4ff', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 3, height: 14, background: '#00d4ff', borderRadius: 2 }} />
            분석 이력
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#778da9', fontSize: 14, padding: '20px 0' }}>아직 분석 이력이 없습니다</div>
          ) : (
            history.map(item => {
              const isExpanded = expandedHistory.has(item.id)
              const badgeColor: Record<string, string> = { '논리오류': '#ff4444', '계산실수': '#ff8c00', '독해오류': '#ffd700', '정답': '#00cc66', '문제풀이': '#00d4ff' }
              return (
                <div key={item.id} style={{ paddingBottom: 14, borderBottom: '1px solid #2d3f55', marginBottom: 14 }}>
                  <div style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => setExpandedHistory(prev => { const s = new Set(prev); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s })}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{item.studentName} · {item.problemNumber}</span>
                        <span style={{ color: '#778da9' }}>{item.date}</span>
                      </div>
                      <div>
                        <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#0d1b2a', marginRight: 6, background: badgeColor[item.errorType] || '#00cc66' }}>{item.errorType}</span>
                        <span style={{ fontSize: 13, color: '#778da9' }}>{item.errorExplanation?.slice(0, 40)}{item.errorExplanation?.length > 40 ? '...' : ''}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#778da9', marginLeft: 10, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #2d3f55', fontSize: 13, color: '#778da9' }}>
                      {item.errorExplanation}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-7px); opacity: 1; }
        }
        * { box-sizing: border-box; }
        input[type="radio"] { accent-color: #00d4ff; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2d3f55; border-radius: 3px; }
      `}</style>
    </div>
  )
}
