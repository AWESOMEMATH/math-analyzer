// 2022 개정 교육과정 JSON을 "토픽 코드" 단위로 평탄화한다.
// 진단 집계가 자유 텍스트 단원명에 의존하면 같은 단원이 여러 이름으로 쪼개져 통계가 깨지므로,
// 모델에게는 반드시 이 코드 중 하나를 고르게 한다.
import fs from 'fs'
import path from 'path'

export interface CurriculumTopic {
  code: string          // 예: H.algebra.3.2 / M.2.1.4.1
  level: 'middle' | 'high'
  course: string        // 공통수학1, 중2-1 등
  chapter: string
  topic: string
  keyConcepts: string[]
  commonErrors: string[]
  order: number         // 교육과정 진행 순서 (선수 관계 근사용)
}

interface RawTopic { topic: string; key_concepts?: string[]; common_errors?: string[] }
interface RawChapter { chapter: number; title: string; topics: RawTopic[] }

let cache: CurriculumTopic[] | null = null

export function loadTopics(): CurriculumTopic[] {
  if (cache) return cache
  const raw = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'curriculum_2022_math.json'), 'utf-8'),
  )
  const out: CurriculumTopic[] = []
  let order = 0
  const push = (code: string, level: 'middle' | 'high', course: string, ch: RawChapter) => {
    ch.topics.forEach((t, i) => {
      out.push({
        code: `${code}.${ch.chapter}.${i + 1}`,
        level,
        course,
        chapter: ch.title,
        topic: t.topic,
        keyConcepts: t.key_concepts ?? [],
        commonErrors: t.common_errors ?? [],
        order: order++,
      })
    })
  }
  for (const [g, gv] of Object.entries<Record<string, { chapters: RawChapter[] }>>(raw.middle_school)) {
    const grade = g.replace('grade_', '')
    for (const [s, sv] of Object.entries(gv)) {
      const sem = s.replace('semester_', '')
      for (const ch of sv.chapters) push(`M.${grade}.${sem}`, 'middle', `중${grade}-${sem}`, ch)
    }
  }
  for (const [key, cv] of Object.entries<{ full_name: string; chapters: RawChapter[] }>(raw.high_school)) {
    for (const ch of cv.chapters) push(`H.${key}`, 'high', cv.full_name, ch)
  }
  cache = out
  return out
}

export function findTopic(code: string | undefined | null): CurriculumTopic | undefined {
  if (!code) return undefined
  return loadTopics().find(t => t.code === code)
}

/** 프롬프트에 넣을 코드표 (85개 토픽, 한 줄씩) */
export function topicCatalog(): string {
  return loadTopics()
    .map(t => `${t.code} | ${t.course} > ${t.chapter} > ${t.topic}`)
    .join('\n')
}
