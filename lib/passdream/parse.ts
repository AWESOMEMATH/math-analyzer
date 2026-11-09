// 패스드림 「과제 성적분석 리포트」 PDF의 글자 줄(extractLines 결과)을 학생별 결과로 바꾼다.
// PDF 글자 정보는 공백이 빠지고 표 한 행이 두 줄로 나뉘어 나오므로, 학생 구간을 한 문자열로
// 이어 붙인 뒤(공백·구분자 제거) 정규식으로 읽는다.
import { unitCodes } from './units'

export interface ParsedUnit {
  label: string          // 패스드림 단원명 (공백 제거)
  codes: string[]        // 2022 개정 대단원 코드, 대응 없으면 []
  items: number
  correct: number
  classCorrect: number
  classTotal: number
}

export interface ParsedResult {
  studentName: string
  title: string
  course: string         // 예: 15-고등수학-수능
  submittedAt: string    // YYYY-MM-DD
  totalItems: number
  correct: number
  rank: number | null
  classSize: number | null
  units: ParsedUnit[]
  wrongItems: number[]
  /** 틀린 문항 번호가 모두 확인됐는가 (리포트는 개념별 TOP3만 보여 줘서 빠질 수 있다) */
  wrongComplete: boolean
  warnings: string[]
}

const TITLE = /^\[(.+?)\]\s*과제\s*성적\s*분석\s*리포트/
const flat = (s: string) => s.replace(/[\s|]/g, '')

export function parseReport(lines: string[]): ParsedResult[] {
  const starts = lines.map((l, i) => (TITLE.test(l.trim()) ? i : -1)).filter(i => i >= 0)
  return starts.map((s, k) => parseSection(lines.slice(s, starts[k + 1] ?? lines.length)))
}

function parseSection(sec: string[]): ParsedResult {
  const warnings: string[] = []
  const title = flat(sec[0]).match(TITLE)?.[1] ?? ''
  const nameLine = (sec[1] ?? '').split('|').map(x => x.trim()).filter(Boolean)
  const studentName = flat(nameLine[0] ?? '')
  const course = flat(nameLine[nameLine.length - 1] ?? '')
  const all = flat(sec.join(''))

  const d = all.match(/제출일:?(\d{4})\.(\d{1,2})\.(\d{1,2})/)
  const submittedAt = d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : ''
  // 숫자가 다음 줄 숫자와 붙지 않도록 점수·석차·문항 번호는 줄 단위로 읽는다
  const lineMatch = (re: RegExp) => { for (const l of sec) { const m = l.match(re); if (m) return m } return null }
  const sc = lineMatch(/(?:^|\|)\s*정답\s*\|\s*(\d+)\s*\/\s*(\d+)\s*$/)
  const totalItems = sc ? Number(sc[2]) : Number(all.match(/총문항수:?(\d+)/)?.[1] ?? 0)
  const correct = sc ? Number(sc[1]) : NaN
  const rk = lineMatch(/석차\s*\|\s*(\d+)\s*\/\s*(\d+)\s*$/)

  // 단원별 정답률 상세 표 — 행: 단원명 [이해도] 문항수 학생% (a/문항수) 반% (c/d) 차이%p [이해도]
  const units: ParsedUnit[] = []
  const tableStart = all.indexOf('정답률차이이해도')
  const tableEnd = all.indexOf('이해도우수문항', tableStart)
  if (tableStart >= 0) {
    const t = all.slice(tableStart + '정답률차이'.length, tableEnd > 0 ? tableEnd : undefined)
    const row = /(?<=이해도|%p|%p높음|%p보통|%p낮음)([^\d%()]+?)(?:높음|보통|낮음)?(\d+?)\d{1,3}\.\d%\((\d+)\/\2\)\d{1,3}\.\d%\((\d+)\/(\d+)\)/g
    for (const m of t.matchAll(row)) {
      // 앞 행 끝의 이해도(높음·보통·낮음)가 단원명 앞에 붙어 읽히는 경우를 걷어 낸다
      const label = m[1].replace(/^(높음|보통|낮음)+/, '')
      units.push({
        label, codes: unitCodes(label),
        items: Number(m[2]), correct: Number(m[3]), classCorrect: Number(m[4]), classTotal: Number(m[5]),
      })
    }
  }
  const unitItems = units.reduce((a, u) => a + u.items, 0)
  const unitCorrect = units.reduce((a, u) => a + u.correct, 0)
  if (!units.length) warnings.push('단원별 표를 읽지 못했습니다')
  else if (unitItems !== totalItems || unitCorrect !== correct) {
    warnings.push(`단원 합계(${unitCorrect}/${unitItems})가 총점(${correct}/${totalItems})과 다릅니다`)
  }
  for (const u of units) if (!u.codes.length) warnings.push(`교육과정 대응이 없는 단원: ${u.label}`)

  // 학생별 리포트 부분의 「N.번 오답/정답」
  const di = sec.findIndex(l => flat(l) === '학생별리포트')
  const wrong = new Set<number>(), right = new Set<number>()
  for (const l of sec.slice(Math.max(0, di))) {
    for (const m of l.matchAll(/(?:^|\|)\s*(\d{1,3})\.\s*번\s*\|\s*(오답|정답)/g)) (m[2] === '오답' ? wrong : right).add(Number(m[1]))
  }
  const conflict = [...wrong].filter(n => right.has(n))
  if (conflict.length) warnings.push(`정답·오답이 함께 표시된 문항: ${conflict.join(', ')}`)
  const wrongItems = [...wrong].sort((a, b) => a - b)
  const wrongComplete = Number.isFinite(correct) && wrongItems.length === totalItems - correct && !conflict.length

  if (!studentName) warnings.push('학생 이름을 읽지 못했습니다')
  if (!Number.isFinite(correct)) warnings.push('총점을 읽지 못했습니다')

  return {
    studentName, title, course, submittedAt, totalItems,
    correct: Number.isFinite(correct) ? correct : unitCorrect,
    rank: rk ? Number(rk[1]) : null, classSize: rk ? Number(rk[2]) : null,
    units, wrongItems, wrongComplete, warnings,
  }
}
