import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DOCUMENT_SCOPE, type SectionOption, type TaskScope } from '../../../contracts/index.js';
export const scopeTitle = (scope: TaskScope): string => scope.kind === 'document' ? '整份文档' : scope.path.at(-1)!.title;
export const scopeTrail = (scope: TaskScope): string => scope.kind === 'document' ? '' : scope.path.map(part => part.title).join(' / ');
export function ScopePicker({ value, sections, disabled, label, onChange }: { value: TaskScope; sections: SectionOption[]; disabled: boolean; label: string; onChange: (scope: TaskScope) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const id = useId(), options = [DOCUMENT_SCOPE, ...sections.map(section => section.scope)];
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
  const filtered = options.filter(scope => normalize(scopeTitle(scope) + ' ' + scopeTrail(scope)).includes(normalize(query.trim())));
  const current = Math.min(active, Math.max(0, filtered.length - 1));
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus({ preventScroll: true }); };
  const select = (scope: TaskScope) => { onChange(scope); close(true); };
  useLayoutEffect(() => {
    if (!open) return;
    const node = menu.current, anchor = trigger.current; if (!node || !anchor) return;
    const place = () => {
      const viewport = window.visualViewport, leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
      const rightEdge = leftEdge + (viewport?.width ?? innerWidth), viewportBottom = topEdge + (viewport?.height ?? innerHeight), gap = 6;
      const rect = anchor.getBoundingClientRect(), footer = root.current?.closest('.lens-document-manager')?.querySelector<HTMLElement>('.lens-manager-footer')?.getBoundingClientRect();
      const bottomEdge = footer && footer.top > rect.bottom ? Math.min(viewportBottom, footer.top - 4) : viewportBottom;
      const below = bottomEdge - rect.bottom - gap - 8, above = rect.top - topEdge - gap - 8;
      const upwards = below < 210 && above > below, available = Math.max(120, Math.min(340, upwards ? above : below));
      const width = Math.max(220, Math.min(rect.width, rightEdge - leftEdge - 16));
      node.style.width = `${width}px`; node.style.maxHeight = `${available}px`;
      node.style.setProperty('--lens-scope-list-height', `${Math.max(72, available - 48)}px`);
      const box = node.getBoundingClientRect(), left = Math.min(Math.max(rect.left, leftEdge + 8), rightEdge - box.width - 8);
      const desiredTop = upwards ? rect.top - box.height - gap : rect.bottom + gap;
      node.style.left = `${left}px`; node.style.top = `${Math.min(Math.max(desiredTop, topEdge + 8), bottomEdge - box.height - 8)}px`;
    };
    if (!node.matches(':popover-open')) node.showPopover(); place();
    const scroller = root.current?.closest('.lens-manager-scroll'), observer = new ResizeObserver(place);
    observer.observe(anchor); observer.observe(node);
    scroller?.addEventListener('scroll', place); window.addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place);
    return () => {
      observer.disconnect(); scroller?.removeEventListener('scroll', place); window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place);
      if (node.matches(':popover-open')) node.hidePopover();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => search.current?.focus({ preventScroll: true }));
    const outside = (event: PointerEvent) => { if (!event.composedPath().includes(root.current!)) close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside, true); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const option = list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`), container = list.current;
    if (!option || !container) return;
    const item = option.getBoundingClientRect(), box = container.getBoundingClientRect();
    if (item.top < box.top) container.scrollTop -= box.top - item.top;
    else if (item.bottom > box.bottom) container.scrollTop += item.bottom - box.bottom;
  }, [current, query, open]);
  return <div ref={root} className="lens-scope-picker" data-lens-escape-scope={open ? '' : undefined}
    onKeyDown={event => { if (open && event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(true); } }}>
    <button type="button" ref={trigger} className="lens-scope-trigger" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={id} disabled={disabled}
      title={scopeTrail(value) || '整份文档'} onClick={() => { setQuery(''); setActive(0); setOpen(!open); }}>
      <span>{scopeTitle(value)}</span><svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    {open && <div ref={menu} popover="manual" className="lens-scope-menu">
      <input ref={search} role="combobox" aria-label={`搜索章节 ${label}`} aria-controls={id} aria-expanded="true" aria-autocomplete="list" aria-activedescendant={filtered.length ? `${id}-${current}` : undefined}
        value={query} autoComplete="off" placeholder="搜索章节…" onChange={event => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, Math.min(filtered.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); }
          if (event.key === 'Enter' && filtered[current]) { event.preventDefault(); select(filtered[current]!); }
        }} />
      <div id={id} ref={list} role="listbox" aria-label="章节范围" className="lens-scope-options">
        {filtered.map((scope, index) => <button key={JSON.stringify(scope)} type="button" role="option" id={`${id}-${index}`} data-index={index} tabIndex={-1}
          aria-selected={JSON.stringify(scope) === JSON.stringify(value)} className={index === current ? 'lens-scope-active' : ''}
          title={scopeTrail(scope) || '整份文档'} onMouseMove={() => setActive(index)} onClick={() => select(scope)}>
          <span>{scopeTitle(scope)}</span>{scope.kind === 'section' && scope.path.length > 1 && <small>{scope.path.slice(0, -1).map(part => part.title).join(' / ')}</small>}
        </button>)}
        {!filtered.length && <p className="lens-muted" role="status">未找到匹配章节</p>}
      </div>
    </div>}
  </div>;
}
