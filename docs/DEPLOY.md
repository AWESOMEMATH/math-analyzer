# 배포 체크리스트

순서가 중요합니다. **카카오 심사가 가장 오래 걸리므로 0단계를 오늘 먼저 신청**하고, 기다리는 동안 1~4단계를 끝냅니다.

## 0. 카카오 — 오늘 신청 (심사 대기)
- [ ] 카카오톡 채널 만들기 (카카오톡 채널 관리자센터). 채널 이름은 학생이 검색할 이름
- [ ] 카카오 i 오픈빌더에서 챗봇 만들기 → 위 채널 연결
- [ ] 봇 설정에서 **AI 챗봇 전환(콜백) 신청** — 승인 전에는 사진 답변이 동작하지 않음 (1분 안에 답하려면 콜백이 필수)
- [ ] 채널 링크(`http://pf.kakao.com/_xxxx`)를 메모 → `KAKAO_CHANNEL_URL`

## 1. Firebase
- [ ] Firebase 프로젝트 생성 → Firestore 데이터베이스 생성 (Native 모드, 위치 `asia-northeast3` 서울 권장)
- [ ] 프로젝트 설정 → 서비스 계정 → 새 비공개 키 → JSON 파일 내용 전체를 `FIREBASE_SERVICE_ACCOUNT`에
- [ ] 규칙·색인 배포 (PC에서 한 번):
  ```bash
  npx firebase-tools login
  npx firebase-tools deploy --only firestore --project <프로젝트ID>
  ```
  색인 생성에 몇 분 걸림. 색인 없이 쓰면 첫 조회가 오류를 냄
- ⚠ 서비스 계정 JSON은 관리자 권한 키입니다. 메신저·메일로 보내거나 저장소에 올리지 마세요

## 2. Vercel
- [ ] **Pro 요금제** — Hobby(무료)는 비상업 용도 전용이라 학원 운영에 쓸 수 없음. 또 풀이가 1분을 넘을 때 함수가 끝까지 돌아야 함
- [ ] GitHub 저장소 Import → Framework: Next.js
- [ ] Settings → Functions → **Fluid Compute 켜짐** 확인 (함수 최대 300초)
- [ ] Settings → Environment Variables (Production)에 `.env.example`의 필수 항목 입력
  - 임의 문자열: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
  - `PUBLIC_BASE_URL`은 배포 후 받은 도메인(또는 연결한 도메인)으로, 끝에 `/` 없이
- [ ] 이 브랜치를 main에 합친 뒤 배포 (Production은 main 기준)
- [ ] 배포 후 Cron Jobs 탭에 `/api/cron/diagnosis` 가 보이는지 확인 (매일 03:17 KST)

## 3. 배포 점검 (`/admin/test`)
- [ ] 환경변수 표가 필수 항목 모두 ✓
- [ ] **정답을 아는 문제 사진 10장 이상**으로 「풀이 시험」
  - 정답이 맞는지, 단원이 맞는지 — 틀리는 유형을 기록
  - 응답 시간 — 45초를 자주 넘으면 학생이 「작성 중」 링크를 먼저 받음. `KAKAO_EFFORT=low`로 줄이는 것을 검토
  - 1건 비용 — 예상(Opus 5.5 기준 약 100~200원)과 비교
  - 손글씨 풀이가 같이 찍힌 사진도 넣어 오답 판정이 맞는지 확인
- [ ] 결과가 만족스럽지 않으면 학생에게 열기 전에 알려 주세요 — 프롬프트를 고칩니다

## 4. 운영 준비
- [ ] 동의 문구 법률 검토 → `CONSENT_OPERATOR`, `CONSENT_RETENTION`, `CONSENT_CONTACT`
- [ ] 개인정보 처리방침 게시 여부 검토 (카카오 채널 프로필에 링크)
- [ ] `/admin`에서 학원·학생 등록, 패스드림 결과 PDF 올려 보기, 시험지 연결 한 회 확정

## 5. 카카오 연결 (콜백 승인 후)
- [ ] 오픈빌더 → 스킬 생성: URL `https://<도메인>/api/kakao/skill`, 헤더 `x-skill-secret: <KAKAO_SKILL_SECRET 값>`
- [ ] 폴백 블록에서 이 스킬 사용, **콜백 사용 체크**
- [ ] 봇 테스트 창에서: 아무 말 → 「연결 코드를 보내 주세요」 / 코드 → 동의 안내 / 사진 → 풀이 노트
- [ ] **사진이 스킬로 들어오는지 확인** — 들어오지 않으면 알려 주세요. 이미지 보안 전송 플러그인 설정이 필요할 수 있고, 코드는 두 방식 모두 받게 되어 있음
- [ ] 봇 배포 → 본인 카톡으로 채널 추가 후 같은 시험

## 6. 시범 운영
- [ ] 학생 2~3명으로 1주 시범 → 노트 품질·응답 시간·비용 로그 확인 (Vercel Logs에 `kakao answer usage`)
- [ ] 문제없으면 학원별로 코드 배포

## 비용 상한 장치
- 학생 1명당 하루 `KAKAO_DAILY_LIMIT`(기본 20)장
- Anthropic 콘솔에서 월 사용 한도(Spend limit) 설정 권장
