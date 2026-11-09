// 패스드림 단원명(2015 개정 과목 기준, 공백 제거) → 2022 개정 교육과정 대단원 코드
// 코드는 lib/kakao/curriculum.ts 토픽 코드의 대단원 접두어(H.과목.단원번호)다.
const MAP: Record<string, string[]> = {
  // 수학Ⅰ → 대수
  지수함수와로그함수: ['H.algebra.1', 'H.algebra.2'],
  지수와로그: ['H.algebra.1'],
  삼각함수: ['H.algebra.3'],
  수열: ['H.algebra.4'],
  // 수학Ⅱ → 미적분Ⅰ
  함수의극한과연속: ['H.calculus_1.1'],
  함수의극한: ['H.calculus_1.1'],
  함수의연속: ['H.calculus_1.1'],
  미분: ['H.calculus_1.2'],
  다항함수의미분법: ['H.calculus_1.2'],
  적분: ['H.calculus_1.3'],
  다항함수의적분법: ['H.calculus_1.3'],
  // 미적분(2015) → 미적분Ⅱ
  수열의극한: ['H.calculus_2.1'],
  미분법: ['H.calculus_2.2'],
  적분법: ['H.calculus_2.3'],
  // 확률과 통계
  경우의수: ['H.probability_statistics.1'],
  순열과조합: ['H.probability_statistics.1'],
  확률: ['H.probability_statistics.2'],
  통계: ['H.probability_statistics.3'],
  // 기하
  이차곡선: ['H.geometry.1'],
  평면벡터: ['H.geometry.2'],
  공간도형과공간좌표: ['H.geometry.3'],
  공간벡터: ['H.geometry.3'],
}

export function unitCodes(label: string): string[] {
  return MAP[label.replace(/\s/g, '')] ?? []
}
