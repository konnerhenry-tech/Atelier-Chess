import React from 'react';

/**
 * Tiny, dependency-free markdown renderer for coach replies.
 * Supports: # headings, - / * / 1. lists, **bold**, *italic*, `code`, and paragraphs.
 * It builds React elements only (never innerHTML), so model output can't inject markup.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: bold before italic so ** isn't consumed as two *.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-700/60 text-[0.9em] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export const MiniMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p-${blocks.length}`;
      blocks.push(
        <p key={k} className="mb-2 last:mb-0">
          {renderInline(para.join(' '), k)}
        </p>
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l-${blocks.length}`;
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k} className={`mb-2 last:mb-0 pl-5 space-y-1 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
          {list.items.map((it, idx) => (
            <li key={`${k}-${idx}`}>{renderInline(it, `${k}-${idx}`)}</li>
          ))}
        </Tag>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(line);

    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      const k = `h-${blocks.length}`;
      blocks.push(
        <div key={k} className="font-semibold mt-1 mb-1">
          {renderInline(heading[1], k)}
        </div>
      );
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !bullet;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || numbered)![1]);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return <div>{blocks}</div>;
};
