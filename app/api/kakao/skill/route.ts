// 카카오 i 오픈빌더 스킬 서버 — 카카오톡 채널 챗봇의 폴백 블록에 연결한다.
//
// 연결: 선생님이 등록한 학생에게 1회용 코드(AW-XXXX) 발급 → 학생이 채널에 코드 전송
//       → 개인정보 동의 → 카카오 계정과 학생 연결. 연결 전에는 사진을 처리하지 않는다.
// 흐름: 학생이 사진 전송 → 5초 안에 "풀이 중" 즉답(useCallback) → after()에서
//       이미지 다운로드 → Claude 풀이 → 손글씨 노트 저장 → callbackUrl로 노트 링크 전송
//       (콜백 유효 시간 1분) → 진단표가 준비돼 있으면 함께 전달.
import { after, NextRequest, NextResponse } from 'next/server'
import { answerFromImage, ANSWER_MODEL, downloadImage } from '@/lib/kakao/answer'
import { MIN_QUESTIONS, MIN_TESTS, runDiagnosis } from '@/lib/kakao/diagnosis'
import { findTopic } from '@/lib/kakao/curriculum'
import {
  completeQuestion, confirmLink, countQuestionsToday, createPendingQuestion, failQuestion, findStudentByCode,
  getLink, getReport, getStudent, normalizeCode, setPendingLink, updateStudent,
} from '@/lib/kakao/store'
import { consentText } from '@/lib/kakao/consent'
import { portalToken } from '@/lib/portal'
import { baseUrl, callbackAck, linkCard, postCallback, quick, simpleText, template } from '@/lib/kakao/respond'
import type { DiagnosisReport, KakaoSkillRequest, Student } from '@/lib/kakao/types'

export const runtime = 'nodejs'
// 1분 콜백을 넘겨도 답변을 끝까지 만들기 위해 함수 실행 시간은 넉넉히 둔다
export const maxDuration = 300

const HELP = `📸 문제 사진을 한 장씩 보내 주세요.
✍️ 내 풀이까지 같이 찍어 보내면 어디서 틀렸는지 짚어 드려요.
📊 4주 동안 질문이 쌓이면 교육과정 단원별 진단표와 처방이 자동으로 만들어져요.
「진단표」라고 보내면 지금까지의 진행 상황을 볼 수 있어요.
📒 「내 기록」을 보내면 내 질문 노트·테스트·진단표를 모아 볼 수 있어요.`

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

// 카카오 콜백은 1분 안에 한 번만 보낼 수 있다. Opus 답변이 이보다 늦으면
// 노트 링크를 먼저 보내고(페이지는 "작성 중" 표시 후 자동 새로고침), 답변은 계속 만든다.
const CALLBACK_DEADLINE_MS = Number(process.env.KAKAO_CALLBACK_DEADLINE_MS || 45000)

function noteCard(id: string, description: string) {
  return linkCard('✏️ AWESOME 손글씨 노트', description, '풀이 노트 보기', `${baseUrl()}/note/${id}`)
}

async function handleImage(body: KakaoSkillRequest, imageUrl: string, student: Student) {
  const userKey = body.userRequest.user.id
  const callbackUrl = body.userRequest.callbackUrl!
  let callbackSent = false
  const send = async (outputs: Parameters<typeof template>[0]) => {
    if (callbackSent) return
    callbackSent = true
    await postCallback(callbackUrl, template(outputs))
  }

  let pending: Awaited<ReturnType<typeof createPendingQuestion>> | null = null
  const timer = setTimeout(() => {
    if (!pending) return
    send([noteCard(pending.id, '풀이가 길어지고 있어요. 1~2분 뒤 버튼을 눌러 주세요. 완성되면 노트가 자동으로 열려요.')])
      .catch(e => console.error('지연 콜백 실패', e))
  }, CALLBACK_DEADLINE_MS)

  try {
    pending = await createPendingQuestion(student, userKey)
    const image = await downloadImage(imageUrl)
    const { note, brainUsed } = await answerFromImage(image)

    if (!note.legible) {
      await failQuestion(pending.id)
      await send([
        simpleText('사진에서 문제를 정확히 읽지 못했어요. 문제 전체가 화면에 들어오게, 밝은 곳에서 그림자 없이 다시 찍어 보내 주세요.'),
      ])
      return
    }

    const rec = await completeQuestion(pending, note, ANSWER_MODEL, brainUsed)
    const topic = findTopic(note.topic_code)
    const verdict =
      note.student_verdict === 'correct' ? '✅ 풀이가 맞았어요.' :
      note.student_verdict === 'wrong' ? '❗ 풀이에서 틀린 지점이 있어요.' : ''

    const outputs = [
      noteCard(rec.id, [topic ? `${topic.course} · ${topic.topic}` : '', verdict, `정답 ${note.answer}`].filter(Boolean).join('\n')),
    ]

    // 4주가 지났으면 이번 질문을 포함해 진단표를 만든다 (콜백을 이미 보냈다면 다음 메시지에 붙는다)
    const d = await runDiagnosis(student.id, false).catch(e => { console.error('진단 실패', e); return null })
    if (!callbackSent) {
      if (d?.status === 'created') {
        outputs.push(reportCard(d.report))
        await updateStudent(student.id, { pendingReportId: null })
      } else if (student.pendingReportId) {
        const r = await getReport(student.pendingReportId)
        if (r) outputs.push(reportCard(r))
        await updateStudent(student.id, { pendingReportId: null })
      }
    }
    await send(outputs)
  } catch (e) {
    console.error('카카오 답변 생성 실패', e)
    if (pending) await failQuestion(pending.id).catch(() => {})
    await send([simpleText('풀이를 만드는 중에 문제가 생겼어요. 잠시 뒤 같은 사진을 다시 보내 주세요.')])
  } finally {
    clearTimeout(timer)
  }
}

async function handleDiagnosisRequest(studentId: string) {
  const d = await runDiagnosis(studentId, true)
  if (d.status === 'created') {
    await updateStudent(studentId, { pendingReportId: null })
    return template([reportCard(d.report)])
  }
  const st = await getStudent(studentId)
  const last = st?.lastReportId ? await getReport(st.lastReportId) : null
  const msg = `이번 4주 주기 질문 ${d.count}건 · 마감까지 ${d.daysLeft}일 남았어요.\n진단표는 질문 ${MIN_QUESTIONS}건 또는 학원 테스트 ${MIN_TESTS}회가 쌓이면 만들어져요. (질문 앞으로 ${Math.max(0, MIN_QUESTIONS - d.count)}건)`
  return template(last ? [simpleText(msg), reportCard(last)] : [simpleText(msg)])
}

export async function POST(req: NextRequest) {
  // 오픈빌더 스킬 설정의 헤더 값으로 출처를 확인한다 (오픈빌더 요청에는 서명이 없다)
  const secret = process.env.KAKAO_SKILL_SECRET
  // 운영에서는 비밀값이 없으면 아무나 요청을 보낼 수 있으므로 받지 않는다
  if (!secret && process.env.NODE_ENV === 'production') {
    console.error('KAKAO_SKILL_SECRET 미설정 — 요청 거부')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }
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

  // ── 연결 단계: 선생님이 준 코드 → 동의 → 학생 연결 ──
  const link = await getLink(userKey)
  const code = imageUrl ? null : normalizeCode(utter)
  if (code) {
    const st = await findStudentByCode(code)
    if (!st) return NextResponse.json(template([simpleText('연결 코드를 찾을 수 없어요. 선생님께 받은 코드를 다시 확인해 주세요. (예: AW-7K3P)')], []))
    await setPendingLink(userKey, st.id, code)
    return NextResponse.json(template([simpleText(consentText(st.name))], quick('동의합니다', '동의하지 않습니다')))
  }
  if (link.pendingStudentId && /^동의하지\s*않/.test(utter)) {
    await setPendingLink(userKey, null, null)
    return NextResponse.json(template([simpleText('동의하지 않아 연결하지 않았어요. 마음이 바뀌면 코드를 다시 보내 주세요.')], []))
  }
  if (link.pendingStudentId && link.pendingCode && /^동의/.test(utter)) {
    const st = await confirmLink(userKey, link.pendingStudentId, link.pendingCode)
    if (!st) return NextResponse.json(template([simpleText('코드가 바뀌었거나 사용할 수 없어요. 선생님께 새 코드를 받아 주세요.')], []))
    return NextResponse.json(template([simpleText(`${st.name} 학생, 연결됐어요! 🎉\n\n${HELP}`)]))
  }
  const student = link.studentId ? await getStudent(link.studentId) : null
  if (!student || !student.active || student.kakaoUserKey !== userKey) {
    return NextResponse.json(template([
      simpleText('AWESOME 질문방이에요. 선생님께 받은 연결 코드(예: AW-7K3P)를 보내 주세요.'),
    ], []))
  }

  if (imageUrl) {
    if (!body.userRequest.callbackUrl) {
      // 콜백이 꺼져 있으면 5초 안에 답할 수 없다 — 설정 문제를 바로 알린다
      return NextResponse.json(template([
        simpleText('지금은 사진 풀이를 받을 수 없어요. (관리자: 오픈빌더 블록의 "콜백 사용"을 켜 주세요)'),
      ]))
    }
    // 학생 한 명이 하루에 보낼 수 있는 사진 수 — 비용 상한
    const limit = Number(process.env.KAKAO_DAILY_LIMIT || 20)
    if ((await countQuestionsToday(student.id)) >= limit) {
      return NextResponse.json(template([
        simpleText(`오늘은 질문을 ${limit}개까지 받을 수 있어요. 내일 다시 보내 주세요. 급한 질문은 선생님께 직접 물어봐 주세요.`),
      ]))
    }
    after(() => handleImage(body, imageUrl, student))
    return NextResponse.json(callbackAck('사진 받았어요! 손글씨 노트로 풀이를 정리하고 있어요. 1분 정도 걸려요 ✏️'))
  }

  if (/^내\s*(기록|페이지)/.test(utter)) {
    const url = `${baseUrl()}/me/${portalToken(student.id, student.portalVersion ?? 0)}`
    return NextResponse.json(template([
      linkCard('📒 내 학습 기록', '질문 노트·학원 테스트·진단표를 한곳에서 볼 수 있어요. 링크는 7일 동안 열려요. 다른 사람에게 보내지 마세요.', '내 기록 보기', url),
    ]))
  }

  if (/진단/.test(utter)) {
    try {
      // 진단표 생성은 Claude 호출이 있어 5초를 넘길 수 있으므로 콜백이 있으면 콜백으로 보낸다
      if (body.userRequest.callbackUrl) {
        const cb = body.userRequest.callbackUrl
        after(async () => {
          try { await postCallback(cb, await handleDiagnosisRequest(student.id)) }
          catch (e) { console.error(e); await postCallback(cb, template([simpleText('진단표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')])) }
        })
        return NextResponse.json(callbackAck('진단표를 확인하고 있어요 📊'))
      }
      return NextResponse.json(await handleDiagnosisRequest(student.id))
    } catch (e) {
      console.error(e)
      return NextResponse.json(template([simpleText('진단표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')]))
    }
  }

  return NextResponse.json(template([simpleText(HELP)]))
}
