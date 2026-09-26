export type PathMode = 'files' | 'directory';
const modes: { value: PathMode; label: string }[] = [{ value: 'files', label: '文件' }, { value: 'directory', label: '目录' }];
export function PathModes({ value, disabled, onChange }: { value: PathMode; disabled: boolean; onChange: (value: PathMode) => void }) {
  return <div className="lens-path-modes" role="radiogroup" aria-label="路径类型">
    {modes.map((mode, index) => <button key={mode.value} type="button" role="radio" aria-checked={mode.value === value} tabIndex={mode.value === value ? 0 : -1} disabled={disabled}
      onClick={() => onChange(mode.value)} onKeyDown={event => {
        const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
        if (!step && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : (index + step + modes.length) % modes.length;
        onChange(modes[next]!.value);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus({ preventScroll: true });
      }}>{mode.label}</button>)}
  </div>;
}
