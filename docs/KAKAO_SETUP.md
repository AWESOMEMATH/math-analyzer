# 카카오톡 자동 답변 · 4주 진단 시스템

## 왜 「오픈채팅」이 아니라 「카카오톡 채널 챗봇」인가
- 카카오톡 오픈채팅에는 공식 봇 API가 없습니다. 오픈채팅 자동응답은 안드로이드 알림 가로채기(메신저봇류)나 PC 매크로뿐이고,
  카카오 운영정책 위반으로 계정이 정지될 수 있습니다. 알림에는 사진 원본이 오지 않아 사진 질문 자동 판독도 사실상 불가능합니다.
- 오픈채팅 닉네임은 학생이 바꿀 수 있어 4주 누적 진단의 "같은 학생" 식별이 성립하지 않습니다.
- 카카오톡 채널 + 카카오 i 오픈빌더 스킬 서버는 공식 경로이며, 사진 URL과 채널별 고정 사용자 키(botUserKey)를 줍니다.
- 운영 방식: 오픈채팅방 공지에 채널 링크를 걸고 "사진 질문은 채널로 1:1로 보내기"로 안내합니다.

## 흐름
1. 학생이 채널 채팅방에 문제 사진(가능하면 자기 풀이 포함)을 보냄
2. `/api/kakao/skill` 이 5초 안에 "풀이 중" 즉답 (콜백 사용)
3. 서버가 Claude로 풀이 → 교육과정 토픽 코드 분류 → Firestore 저장
4. 1분 안에 콜백으로 「손글씨 노트」 링크 전송 (`/note/{id}`, 브라우저에서 PDF 저장 가능)
5. 첫 질문일부터 28일이 지나고 질문이 `DIAG_MIN_QUESTIONS`(기본 8)건 이상이면 진단표 생성 (`/report/{id}`)
   - 매일 크론(`/api/cron/diagnosis`)이 미리 만들고, 학생의 다음 메시지 응답에 붙여 보냄
     (채널 챗봇은 먼저 말을 걸 수 없음 — 선발송이 필요하면 알림톡 별도 계약)
   - 학생이 「진단표」를 보내면 진행 상황 또는 중간 진단을 받음
   - 표본이 부족하면 주기를 닫지 않고 계속 누적

## 설정
### 오픈빌더
- 카카오톡 채널 생성 → 오픈빌더에서 봇 생성 → 채널 연결
- 스킬 등록: URL `https://<도메인>/api/kakao/skill`, 헤더 `x-skill-secret: <KAKAO_SKILL_SECRET>`
- 폴백 블록에 스킬 연결, **콜백 사용 ON** (AI 챗봇 콜백 기능은 오픈빌더에 별도 신청·승인 필요)

### 환경변수
```
ANTHROPIC_API_KEY=...
KAKAO_MODEL=claude-sonnet-5-5          # 1분 콜백 안에 끝나야 하므로 Opus는 비권장
KAKAO_SKILL_SECRET=<임의 문자열>
PUBLIC_BASE_URL=https://<도메인>
FIREBASE_SERVICE_ACCOUNT=<서비스 계정 JSON 한 줄>
CRON_SECRET=<임의 문자열>               # Vercel Cron이 Authorization: Bearer 로 보냄
DIAG_MIN_QUESTIONS=8
BRAIN_API_URL=                         # 선택 — 연구실 PC 브레인 조회 서버
BRAIN_API_TOKEN=
```

### Firestore
- `firestore.rules` 배포 (kakao_* 컬렉션은 클라이언트 접근 차단)
- 복합 색인: `kakao_questions` — `userKey` 오름차순 + `createdAt` 오름차순

## 브레인 연동
브레인 DB(약 4.4GB)는 연구실 PC에 있어 서버가 직접 열 수 없습니다. 연구실 PC에서
`POST /context {query}` → `{techniques[], similar[{id,summary}]}` 를 열어 두고(터널 등) `BRAIN_API_URL`을 넣으면
풀이 프롬프트에 근거로 들어갑니다. 연결이 없거나 3초 안에 응답이 없으면 교육과정 JSON만으로 답변하며,
질문 기록의 `brainUsed` 필드로 구분됩니다.

## 알려진 한계
- 손글씨 노트 스킬의 「수학 검토(생략 금지)」 단계는 자동화에서 사람이 하지 않습니다. 노트 하단에 AI 풀이임을 표기했습니다.
- 그래프 그림(SVG)은 자동 생성하지 않습니다.
- Turbo 폰트는 재배포 불가라 웹 노트에서는 Permanent Marker로 대체했습니다.
- 사진 1장 = 문제 1개 기준입니다. 여러 문제가 찍힌 사진은 첫 문제 위주로 답합니다.
