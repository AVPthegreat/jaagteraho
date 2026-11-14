/* A small set of line icons, drawn on a 24 px grid with one stroke weight. Decorative only. */
const PATHS: Record<string, string> = {
  shield: "M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3Zm-3 9l2 2 4-4",
  ear: "M7 10a5 5 0 1 1 10 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 0M10 10a2 2 0 1 1 4 0",
  scale: "M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0L5 7Zm14 0l-2.5 6a3 3 0 0 0 5 0L19 7Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2l4 4",
  wrench: "M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2Z",
  check: "M4 12.5l5 5L20 6.5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  key: "M14 10a4 4 0 1 0-3.5 4L10 14.5V17h2.5v2.5H15l.5-.5v-2.5L13.5 14.5A4 4 0 0 0 14 10Zm1.5-1.5h.01",
  branch: "M7 4v10m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm10-4a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0c0 4-10 2-10 6",
  undo: "M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  card: "M3 7h18v11H3zM3 10.5h18M7 15h3",
  plug: "M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8ZM12 16.5V21",
  phone: "M6 3h4l1.5 4.5-2.5 1.5a11 11 0 0 0 6 6l1.5-2.5L21 14v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z",
  play: "M8 5v14l11-7L8 5Z",
  gauge: "M4 17a8 8 0 1 1 16 0M12 17l4-5",
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ""} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
