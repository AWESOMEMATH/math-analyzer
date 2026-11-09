// AWESOME 선화 캐릭터 「계랑이」 (awesome-handwriting-note 4-1절 B 계열 기본값)
// 외부 이미지 없이 코드로 그린 원본 캐릭터 — 저작권·약관 문제 없음
const INK = '#26324a'
const ORG = '#f08a24'
const CHEEK = '#ff9e8a'

type Mood = 'smile' | 'oh' | 'pout' | 'wink'
type Arm = 'right' | 'up' | 'none'

export default function Mascot({ mood = 'smile', arm = 'none', size = 88 }: { mood?: Mood; arm?: Arm; size?: number }) {
  const cx = 55, cy = 58, l = cx - 10, r = cx + 10
  return (
    <svg viewBox="0 0 110 110" width={size} height={size} aria-hidden>
      <ellipse cx="55" cy="104" rx="28" ry="4" fill="#d9efe9" />
      <ellipse cx="55" cy="62" rx="30" ry="38" fill="#fff" stroke={INK} strokeWidth="3" />
      <path d="M30 40 q25 -26 50 0 q-25 -8 -50 0z" fill={ORG} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="55" cy="18" r="4" fill={ORG} stroke={INK} strokeWidth="2.4" />
      <circle cx={l} cy={cy} r="3.2" fill={INK} />
      {mood === 'wink'
        ? <path d={`M${r - 4} ${cy} q4 -4 8 0`} stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        : <circle cx={r} cy={cy} r="3.2" fill={INK} />}
      {mood === 'pout' && <path d={`M${l - 6} ${cy - 9} l10 3 M${r + 6} ${cy - 9} l-10 3`} stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
      <ellipse cx={l - 7} cy={cy + 10} rx="5" ry="3.2" fill={CHEEK} opacity=".8" />
      <ellipse cx={r + 7} cy={cy + 10} rx="5" ry="3.2" fill={CHEEK} opacity=".8" />
      {mood === 'oh' && <ellipse cx={cx} cy={cy + 13} rx="4" ry="5" fill={INK} />}
      {mood === 'pout' && <path d={`M${cx - 7} ${cy + 15} q7 -6 14 0`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />}
      {(mood === 'smile' || mood === 'wink') && <path d={`M${cx - 7} ${cy + 11} q7 7 14 0`} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />}
      {arm === 'right' && <>
        <path d="M84 70 q10 -6 17 -10" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="101" cy="59" r="3.6" fill="#fff" stroke={INK} strokeWidth="2" />
      </>}
      {arm === 'up' && <>
        <path d="M84 70 q8 -10 9 -24" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="93" cy="44" r="3.6" fill="#fff" stroke={INK} strokeWidth="2" />
      </>}
    </svg>
  )
}
