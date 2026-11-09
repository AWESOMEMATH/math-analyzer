// 카카오 i 오픈빌더 스킬 서버 — 카카오톡 채널 챗봇의 폴백 블록에 연결한다.
//
// 흐름: 학생이 사진 전송 → 5초 안에 "풀이 중" 즉답(useCallback) → after()에서
//       이미지 다운로드 → Claude 풀이 → 손글씨 노트 저장 → callbackUrl로 노트 링크 전송
//       (콜백 유효 시간 1분) → 진단표가 준비돼 있으면 함께 전달.
import { after, NextRequest, NextResponse } from 'next/server'
import { answerFromImage, ANSWER_MODEL, downloadImage } from '@/lib/kakao/answer'
import { MIN_QUESTIONS, runDiagnosis } from '@/lib/kakao/diagnosis'
import { findTopic } from '@/lib/kakao/curriculum'
import { getOrCreateUser, getReport, saveQuestion, updateUser } from '@/lib/kakao/store'
import { baseUrl, callbackAck, linkCard, postCallback, simpleText, template } from '@/lib/kakao/respond'
import type { KakaoSkillRequest } from '@/lib/kakao/types'
import type { DiagnosisReport } from '@/lib/kakao/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const HELP = `📸 문제 사진을 한 장씩 보내 주세요.
✍️ 내 풀이까지 같이 찍어 보내면 어디서 틀렸는지 짚어 드려요.
📊 4주 동안 질문이 쌓이면 교육과정 단원별 진단표와 처방이 자동으로 만들어져요.
「진단표」라고 보내면 지금까지의 진행 상황을 볼 수 있어요.`

/** 사진 URL 추출 — 일반 이미지 전송, media 파라미터, 보안 이미지 플러그인 모두 대응 */
function extractImageUrl(body: KakaoSkillRequest): string | null {
  const media = body.userRequest.params?.media
  if (media?.url && (!media.type || media.type === 'image')) return media.url
  const secure = body.action?.params?.secureimage
  if (secure) {
    try {
      const j = JSON.parse(secure) as { secureUrls?: string }
      const m = j.secureUrls?.match(/https?:\/\/[^,)\s]+/)
      if (m) return m[0]
    } catch {}
  }
  const u = body.userRequest.utterance?.trim()
  if (u && /^https?:\/\/\S+$/.test(u) && /kakao|kakaocdn/.test(u)) return u
  return null
}

function reportCard(r: DiagnosisReport) {
  const top = r.solution.priorities[0]
  return linkCard(
    '📊 4주 진단표가 도착했어요',
    `질문 ${r.total}건 분석 · ${top ? `우선 단원 ${top.label}` : r.solution.headline}`,
    '진단표 보기',
    `${baseUrl()}/report/${r.id}`,
  )
}

async function handleImage(body: KakaoSkillRequest, imageUrl: string) {
  const userKey = body.userRequest.user.id
  const callbackUrl = body.userRequest.callbackUrl!
  try {
    const user = await getOrCreateUser(userKey)
    const image = await downloadImage(imageUrl)
    const { note, brainUsed } = await answerFromImage(image)

    if (!note.legible) {
      await postCallback(callbackUrl, template([
        simpleText('사진에서 문제를 정확히 읽지 못했어요. 문제 전체가 화면에 들어오게, 밝은 곳에서 그림자 없이 다시 찍어 보내 주세요.'),
      ]))
      return
    }

    const rec = await saveQuestion(userKey, note, ANSWER_MODEL, brainUsed)
    const topic = findTopic(note.topic_code)
    const verdict =
      note.student_verdict === 'correct' ? '✅ 풀이가 맞았어요.' :
      note.student_verdict === 'wrong' ? '❗ 풀이에서 틀린 지점이 있어요.' : ''

    const outputs = [
      linkCard(
        '✏️ AWESOME 손글씨 노트',
        [topic ? `${topic.course} · ${topic.topic}` : '', verdict, `정답 ${note.answer}`].filter(Boolean).join('\n'),
        '풀이 노트 보기',
        `${baseUrl()}/note/${rec.id}`,
      ),
    ]

    // 4주가 지났으면 이번 질문을 포함해 진단표를 만든다
    const d = await runDiagnosis(userKey, false).catch(e => { console.error('진단 실패', e); return null })
    if (d?.status === 'created') {
      outputs.push(reportCard(d.report))
      await updateUser(userKey, { pendingReportId: null })
    } else if (user.pendingReportId) {
      const r = await getReport(user.pendingReportId)
      if (r) outputs.push(reportCard(r))
      await updateUser(userKey, { pendingReportId: null })
    }
    await postCallback(callbackUrl, template(outputs))
  } catch (e) {
    console.error('카카오 답변 생성 실패', e)
    await postCallback(callbackUrl, template([
      simpleText('풀이를 만드는 중에 문제가 생겼어요. 잠시 뒤 같은 사진을 다시 보내 주세요.'),
    ]))
  }
}

async function handleDiagnosisRequest(userKey: string) {
  const d = await runDiagnosis(userKey, true)
  if (d.status === 'created') {
    await updateUser(userKey, { pendingReportId: null })
    return template([reportCard(d.report)])
  }
  const user = await getOrCreateUser(userKey)
  const last = user.lastReportId ? await getReport(user.lastReportId) : null
  const msg = `이번 4주 주기 질문 ${d.count}건 · 마감까지 ${d.daysLeft}일 남았어요.\n진단표는 질문이 ${MIN_QUESTIONS}건 이상 쌓이면 만들어져요. (앞으로 ${Math.max(0, MIN_QUESTIONS - d.count)}건)`
  return template(last ? [simpleText(msg), reportCard(last)] : [simpleText(msg)])
}

export async function POST(req: NextRequest) {
  // 오픈빌더 스킬 설정의 헤더 값으로 출처를 확인한다 (오픈빌더 요청에는 서명이 없다)
  const secret = process.env.KAKAO_SKILL_SECRET
  if (secret && req.headers.get('x-skill-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: KakaoSkillRequest
  try {
    body = (await req.json()) as KakaoSkillRequest
  } catch {
    return NextResponse.json(template([simpleText('요청을 읽지 못했어요.')]))
  }
  const userKey = body.userRequest?.user?.id
  if (!userKey) return NextResponse.json(template([simpleText('사용자 정보를 확인하지 못했어요.')]))

  const imageUrl = extractImageUrl(body)
  const utter = (body.userRequest.utterance || '').trim()

  if (imageUrl) {
    if (!body.userRequest.callbackUrl) {
      // 콜백이 꺼져 있으면 5초 안에 답할 수 없다 — 설정 문제를 바로 알린다
      return NextResponse.json(template([
        simpleText('지금은 사진 풀이를 받을 수 없어요. (관리자: 오픈빌더 블록의 "콜백 사용"을 켜 주세요)'),
      ]))
    }
    after(() => handleImage(body, imageUrl))
    return NextResponse.json(callbackAck('사진 받았어요! 손글씨 노트로 풀이를 정리하고 있어요. 30초 정도 걸려요 ✏️'))
  }

  if (/진단/.test(utter)) {
    try {
      // 진단표 생성은 Claude 호출이 있어 5초를 넘길 수 있으므로 콜백이 있으면 콜백으로 보낸다
      if (body.userRequest.callbackUrl) {
        const cb = body.userRequest.callbackUrl
        after(async () => {
          try { await postCallback(cb, await handleDiagnosisRequest(userKey)) }
          catch (e) { console.error(e); await postCallback(cb, template([simpleText('진단표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')])) }
        })
        return NextResponse.json(callbackAck('진단표를 확인하고 있어요 📊'))
      }
      return NextResponse.json(await handleDiagnosisRequest(userKey))
    } catch (e) {
      console.error(e)
      return NextResponse.json(template([simpleText('진단표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')]))
    }
  }

  return NextResponse.json(template([simpleText(HELP)]))
}
