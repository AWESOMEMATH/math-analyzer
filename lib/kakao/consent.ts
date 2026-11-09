// 카카오 연결 시 보여 주는 개인정보 수집·이용 및 국외 이전 동의 안내.
// ⚠️ 초안입니다. 운영 전에 법률 검토를 받고 보관 기간·문의처를 실제 값으로 바꾸세요
//    (환경변수 CONSENT_OPERATOR, CONSENT_RETENTION, CONSENT_CONTACT).

export const CONSENT_VERSION = '2026-11-draft'

export function consentText(studentName: string): string {
  const operator = process.env.CONSENT_OPERATOR || 'AWESOME MATH LAB'
  const retention = process.env.CONSENT_RETENTION || '수강 종료 후 1년 (삭제 요청 시 지체 없이 파기)'
  const contact = process.env.CONSENT_CONTACT || '담당 선생님'
  return `${studentName} 학생으로 연결하려면 아래 내용에 동의해 주세요.

[개인정보 수집·이용]
· 수집 항목: 이름, 구분(재학/N수), 학년, 학교, 수강 학원, 보낸 문제 사진과 풀이
· 목적: 질문 답변, 단원별 학습 진단
· 보관: ${retention}

[국외 이전]
· 문제 사진은 풀이 생성을 위해 Anthropic(미국)으로 전송됩니다.
· 질문 기록은 Google Firebase에 저장됩니다.

동의하지 않으면 이 서비스를 이용할 수 없습니다.
운영: ${operator} · 문의: ${contact}`
}
