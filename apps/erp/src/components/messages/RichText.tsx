import { Fragment } from 'react';
import { parseRich, type Inline } from '@/lib/communication';
import { cn } from '@/lib/utils';

function Runs({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.kind === 'bold' ? (
          <strong key={i}>{r.text}</strong>
        ) : r.kind === 'link' ? (
          <a key={i} href={r.href} target="_blank" rel="noopener noreferrer nofollow" className="text-teal-ink underline underline-offset-2">
            {r.text}
          </a>
        ) : (
          <Fragment key={i}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}

/** An announcement body: paragraphs, lists, bold and links (the light markdown the composer writes). */
export function RichText({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn('grid gap-2 text-[13.5px] leading-[20px] break-words', className)} data-testid="rich-text">
      {parseRich(body).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Runs runs={l} />
              </Fragment>
            ))}
          </p>
        ) : b.kind === 'ul' ? (
          <ul key={i} className="list-disc pl-5 grid gap-0.5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Runs runs={it} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal pl-5 grid gap-0.5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Runs runs={it} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
