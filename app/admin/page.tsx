import type { Metadata } from 'next'
import { isAdmin } from '@/lib/admin'
import { countQuestions, listAcademies, listStudents } from '@/lib/kakao/store'
import { curriculumOf, defaultTargetYear } from '@/lib/kakao/exam'
import {
  addAcademyAction, addStudentAction, bulkAddAction, loginAction, logoutAction, reissueCodeAction, toggleActiveAction,
} from './actions'
import './admin.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'AWESOME 학생 관리', robots: { index: false, follow: false } }

type SP = Promise<{ academy?: string; error?: string; added?: string }>

export default async function AdminPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  if (!(await isAdmin())) {
    return (
      <main className="adm">
        <h1>AWESOME 학생 관리</h1>
        <form action={loginAction} className="card row">
          <input type="password" name="password" placeholder="관리자 비밀번호" required autoFocus />
          <button>로그인</button>
        </form>
        {sp.error === 'login' && <p className="err">비밀번호가 맞지 않습니다.</p>}
        {!process.env.ADMIN_PASSWORD && <p className="err">ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.</p>}
      </main>
    )
  }

  const academies = await listAcademies()
  const current = sp.academy && academies.some(a => a.id === sp.academy) ? sp.academy : academies[0]?.id
  const students = current ? await listStudents(current) : []
  const counts = await Promise.all(students.map(s => countQuestions(s.id).catch(() => 0)))
  const schools = [...new Set(students.map(s => s.school).filter(Boolean))].sort()
  const channel = process.env.KAKAO_CHANNEL_URL || '(카카오톡 채널 링크)'
  const academyName = (id: string) => academies.find(a => a.id === id)?.name ?? '-'

  return (
    <main className="adm">
      <header className="top">
        <h1>AWESOME 학생 관리</h1>
        <form action={logoutAction}><button className="ghost">로그아웃</button></form>
      </header>
      {sp.error && sp.error !== 'login' && <p className="err">{sp.error}</p>}
      {sp.added && <p className="ok">{sp.added}명을 등록했습니다.</p>}

      <section className="card">
        <h2>학원</h2>
        <nav className="tabs">
          {academies.map(a => (
            <a key={a.id} href={`/admin?academy=${a.id}`} className={a.id === current ? 'on' : ''}>{a.name}</a>
          ))}
        </nav>
        <form action={addAcademyAction} className="row">
          <input name="name" placeholder="새 학원 이름" required />
          <button>학원 추가</button>
        </form>
      </section>

      {current && (
        <>
          <section className="card">
            <h2>학생 등록 — {academyName(current)}</h2>
            <form action={addStudentAction} className="grid">
              <input type="hidden" name="academyId" value={current} />
              <label>이름<input name="name" required /></label>
              <label>구분
                <select name="status" defaultValue="재학"><option>재학</option><option>N수</option></select>
              </label>
              <label>학년 (재학생)
                <select name="grade" defaultValue="2"><option value="1">고1</option><option value="2">고2</option><option value="3">고3</option></select>
              </label>
              <label>학교<input name="school" list="schools" placeholder="OO고 (N수생은 출신고, 비워도 됨)" /></label>
              <label>목표 수능 학년도
                <input name="targetYear" type="number" placeholder={`비우면 자동 (고2 → ${defaultTargetYear('enrolled', 2)})`} />
              </label>
              <label>메모<input name="memo" /></label>
              <button>등록하고 코드 발급</button>
            </form>
            <datalist id="schools">{schools.map(s => <option key={s} value={s} />)}</datalist>

            <details>
              <summary>엑셀에서 여러 명 붙여넣기</summary>
              <form action={bulkAddAction}>
                <input type="hidden" name="academyId" value={current} />
                <p className="hint">한 줄에 한 명 — 이름, 구분(재학/N수), 학년, 학교, 목표학년도(선택), 메모(선택). 엑셀에서 열을 복사해 그대로 붙여넣으면 됩니다. 한 줄이라도 틀리면 아무도 등록되지 않습니다.</p>
                <textarea name="rows" rows={6} placeholder={'홍길동\t재학\t2\t서울고\n김철수\tN수\t\t\t2028'} />
                <button>일괄 등록</button>
              </form>
            </details>
          </section>

          <section className="card">
            <h2>학생 {students.length}명</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>이름</th><th>구분</th><th>학교</th><th>목표 수능</th><th>카톡 연결</th><th>질문</th><th></th></tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className={s.active ? '' : 'off'}>
                      <td>{s.name}{s.memo && <div className="hint">{s.memo}</div>}</td>
                      <td>{s.status === 'repeat' ? 'N수' : `고${s.grade}`}</td>
                      <td>{s.school || '-'}</td>
                      <td>{s.targetYear}<div className="hint">{curriculumOf(s.targetYear)}</div></td>
                      <td>
                        {s.kakaoUserKey
                          ? <span className="ok">연결됨 {s.consentAt ? new Date(s.consentAt).toLocaleDateString('ko-KR') : ''}</span>
                          : s.linkCode
                            ? <><b className="code">{s.linkCode}</b><div className="hint">채널 {channel} 추가 후 코드 전송</div></>
                            : '-'}
                      </td>
                      <td className="num">{counts[i]}</td>
                      <td className="acts">
                        <form action={reissueCodeAction}><input type="hidden" name="id" value={s.id} /><button className="ghost">코드 재발급</button></form>
                        <form action={toggleActiveAction}><input type="hidden" name="id" value={s.id} /><button className="ghost">{s.active ? '중지' : '재개'}</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">코드 재발급: 휴대폰을 바꿨거나 다른 사람이 연결한 경우. 기존 카톡 연결은 끊기고 질문 기록은 학생에게 그대로 남습니다.</p>
          </section>
        </>
      )}
      {!current && <p className="hint">먼저 학원을 추가하세요.</p>}
    </main>
  )
}
