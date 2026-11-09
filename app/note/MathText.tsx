import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

/** $...$ 수식과 줄바꿈을 살려 렌더링한다 (줄 하나 = 등호 하나 규칙 유지) */
export default function MathText({ text, className }: { text: string; className?: string }) {
  const md = (text || '').replace(/\n/g, '  \n')
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {md}
      </ReactMarkdown>
    </div>
  )
}
