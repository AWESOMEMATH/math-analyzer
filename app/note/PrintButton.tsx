'use client'
export default function PrintButton() {
  return <button className="print" onClick={() => window.print()}>PDF로 저장</button>
}
