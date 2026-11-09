// 브라우저에서 PDF 글자 줄을 뽑는다. 파일을 서버로 올리지 않으므로 업로드 용량 제한(Vercel 4.5MB)에 걸리지 않고,
// 서버에는 몇십 KB의 글자만 보낸다.
'use client'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

export async function extractLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    // 같은 높이(3pt 단위)의 글자 조각을 한 줄로 모으고, 간격이 넓으면 | 로 구분한다
    const rows = new Map<number, { x: number; s: string; w: number }[]>()
    for (const it of tc.items as TextItem[]) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5] / 3) * 3
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y)!.push({ x: it.transform[4], s: it.str, w: it.width })
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const r = rows.get(y)!.sort((a, b) => a.x - b.x)
      let out = '', end: number | null = null
      for (const c of r) { out += end === null ? c.s : (c.x - end > 6 ? ' | ' : '') + c.s; end = c.x + c.w }
      lines.push(out.trim())
    }
  }
  return lines
}
