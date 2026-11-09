// 목표 수능 학년도 기본값 계산. 관리자가 등록할 때 바꿀 수 있다.

/** 학년도는 3월에 바뀐다 (1~2월은 전년도 학년도) */
export function academicYear(now = new Date()): number {
  return now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1
}

/** 다음에 치를 수능의 학년도 — 수능은 매년 11월 셋째 주 무렵, 그해+1 학년도 */
export function nextExamYear(now = new Date()): number {
  const y = now.getFullYear()
  const examPassed = now.getMonth() + 1 === 12 || (now.getMonth() + 1 === 11 && now.getDate() >= 20)
  return examPassed ? y + 2 : y + 1
}

export function defaultTargetYear(status: 'enrolled' | 'repeat', grade: number | null, now = new Date()): number {
  if (status === 'repeat' || !grade) return nextExamYear(now)
  return academicYear(now) + 1 + (3 - grade)
}

export function curriculumOf(targetYear: number): '2022 개정' | '2015 개정' {
  return targetYear >= 2028 ? '2022 개정' : '2015 개정'
}
