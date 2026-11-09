// 매일 1회: 4주 주기가 끝난 학생의 진단표를 미리 만들어 둔다.
// 카카오 채널 챗봇은 학생에게 먼저 메시지를 보낼 수 없으므로(알림톡 별도 계약 필요),
// 만든 진단표는 pendingReportId로 걸어 두었다가 학생의 다음 메시지 응답에 붙여 보낸다.
import { NextRequest, NextResponse } from 'next/server'
import { runDiagnosis } from '@/lib/kakao/diagnosis'
import { listDueUsers } from '@/lib/kakao/store'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const users = await listDueUsers()
  const result = { due: users.length, created: 0, notEnough: 0, failed: 0 }
  for (const u of users) {
    try {
      const d = await runDiagnosis(u.userKey, false)
      if (d.status === 'created') result.created++
      else if (d.status === 'not_enough') result.notEnough++
    } catch (e) {
      console.error('진단 실패', u.userKey, e)
      result.failed++
    }
  }
  return NextResponse.json(result)
}
