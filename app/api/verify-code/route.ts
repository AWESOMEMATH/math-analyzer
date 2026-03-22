import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { code } = await req.json()
  const validCodes = (process.env.INVITE_CODES || '').split(',').map(c => c.trim())
  
  if (validCodes.includes(code)) {
    const response = NextResponse.json({ valid: true })
    // httpOnly로 설정되어 프론트엔드 자바스크립트에서 접근할 수 없습니다
    response.cookies.set('invite_code', encodeURIComponent(code), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: '/'
    })
    return response
  }
  
  return NextResponse.json({ valid: false }, { status: 401 })
}
