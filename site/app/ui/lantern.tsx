/* The watchman's lantern: the mark beside the wordmark and the bot's avatar. */
export function Lantern({ size = 28, ink = "#a9b0c2" }: { size?: number; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M10 6h8M11 6v3h6V6M9 9h10l-1 12H10L9 9Z" stroke="#f2b441" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 13v4" stroke="#f2b441" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 24h12" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
