import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  let inviteCode = req.headers.get('x-invite-code') || req.cookies.get('invite_code')?.value || ''
  try { inviteCode = decodeURIComponent(inviteCode) } catch {}
  
  const validCodes = (process.env.INVITE_CODES || '').split(',').map(c => c.trim())
  
  // ENV가 설정되지 않은 로컬 개발/테스트 환경의 경우 통과
  if (validCodes.length === 0 || (validCodes.length === 1 && validCodes[0] === '')) {
    return NextResponse.next()
  }

  // Preflight 요청 통과
  if (req.method === 'OPTIONS') {
    return NextResponse.next()
  }

  // 제출된 초대코드 검증
  if (!inviteCode || !validCodes.includes(inviteCode)) {
    return NextResponse.json(
      { error: '로그인 세션이 만료되었거나 올바르지 않은 초대코드입니다. 페이지를 새로고침 해주세요.' }, 
      { status: 401 }
    )
  }

  return NextResponse.next()
}

// 분석 API와 채팅 API 라우트에만 미들웨어를 적용합니다.
export const config = {
  matcher: ['/api/analyze/:path*', '/api/chat/:path*']
}
