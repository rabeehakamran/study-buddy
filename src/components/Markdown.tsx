import { Children, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const BR = /<br\s*\/?>/gi; // for split/replace
const HAS_BR = /<br\s*\/?>/i; // for test (a /g regex would remember its position between calls)

/** Turn literal "<br>" text (which AIs love to put in tables) into real line breaks. */
function withBreaks(children: ReactNode): ReactNode {
  return Children.map(children, (child) =>
    typeof child === 'string' && HAS_BR.test(child)
      ? child.split(BR).flatMap((part, i) => (i === 0 ? [part] : [<br key={i} />, part]))
      : child,
  );
}

/** Renders Buddy's markdown safely (no raw HTML). */
export default function Markdown({ children }: { children: string }) {
  // Outside tables, "<br>" can simply become a markdown line break.
  const text = children
    .split('\n')
    .map((line) => (line.trimStart().startsWith('|') ? line : line.replace(BR, '  \n')))
    .join('\n');

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          td: ({ node: _node, children, ...props }) => <td {...props}>{withBreaks(children)}</td>,
          th: ({ node: _node, children, ...props }) => <th {...props}>{withBreaks(children)}</th>,
          li: ({ node: _node, children, ...props }) => <li {...props}>{withBreaks(children)}</li>,
          p: ({ node: _node, children, ...props }) => <p {...props}>{withBreaks(children)}</p>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
