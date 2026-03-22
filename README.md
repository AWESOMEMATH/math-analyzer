# math-analyzer — AI 수학 오답 분석기
AWESOME MATH LAB · 정현경 연구실

## 📦 설치

```bash
npm install
npm install firebase @anthropic-ai/sdk react-markdown remark-math rehype-katex remark-gfm
```

## ⚙️ 환경변수 설정 (.env.local)

```
ANTHROPIC_API_KEY=sk-ant-...
INVITE_CODES=CODE_ALPHA,CODE_BETA   # 쉼표로 구분
MONTHLY_QUESTION_LIMIT=30
NEXT_PUBLIC_FIREBASE_PROJECT_ID=... # Firebase 사용 시
```

## 🚀 실행

```bash
npm run dev        # 개발
npm run build      # 빌드
npm start          # 프로덕션
```

## 📁 파일 구조

```
app/
  page.tsx                  ← 메인 UI
  layout.tsx                ← html2canvas/html2pdf CDN 포함
  globals.css
  api/
    analyze/route.ts        ← OCR + 분석 (2단계 파이프라인)
    chat/route.ts           ← 카드별 채팅
lib/
  firebase.ts               ← Firebase 초기화
  usage.ts                  ← 월별 문항 사용량 추적
middleware.ts               ← 초대 코드 인증
firestore.rules             ← Firestore 보안 규칙
```

## 🔑 주요 기능

- 이미지 업로드 (최대 5장, 드래그앤드롭, 클립보드 붙여넣기)
- 2단계 AI 파이프라인: Claude Vision OCR → 오답분석/직접풀이
- KaTeX 수식 렌더링
- 카드별 개별 채팅
- 이미지/PDF 저장 (html2canvas, html2pdf)
- Firebase 분석 이력 저장
- 초대 코드 기반 접근 제한
- 사용자별 월 문항 제한
