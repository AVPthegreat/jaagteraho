/* The watchman's lantern: the mark beside the wordmark and the bot's avatar. */
export function Lantern({ size = 28, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <svg className="lantern" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12 4.5h8M16 2v2.5" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 8h10l-1-3.5h-8L11 8Z" fill="currentColor" fillOpacity=".55" />
      <path d="M10 8.5h12l-1.4 15H11.4L10 8.5Z" stroke="#f5b544" strokeWidth="1.8" strokeLinejoin="round" fill={lit ? "rgba(245,181,68,.16)" : "none"} />
      {lit && <ellipse cx="16" cy="16.5" rx="2.4" ry="3.6" fill="#ffd27a" />}
      <path d="M9 26.5h14" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
