import { Fragment } from 'react';
import { GLOSSARY } from '../engine/glossary';
import { useApp } from './ctx';

/** Renders text with {{term}} / {{term|label}} tokens as tappable glossary words. */
export function Rich({ text }: { text: string }) {
  const { term } = useApp();
  const out: React.ReactNode[] = [];
  const re = /\{\{(\w+)(?:\|([^}]+))?\}\}/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    const key = m[1];
    const label = m[2] || GLOSSARY[key]?.he || key;
    out.push(GLOSSARY[key]
      ? <span key={i++} className="term" role="button" tabIndex={0} onClick={e => { e.stopPropagation(); term(key); }} onKeyDown={e => e.key === 'Enter' && term(key)}>{label}</span>
      : <Fragment key={i++}>{label}</Fragment>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}
