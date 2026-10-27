// Console icons: 16px grid, 1.5px strokes, square caps, drawn for this UI.

const PATHS = {
  overview: 'M3 3.5h4.5V8H3zM8.5 3.5H13V6H8.5zM8.5 7H13v5.5H8.5zM3 9h4.5v3.5H3z',
  investigations: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6 14 14M5 7h4M7 5v4',
  runs: 'M2.5 4h11M2.5 8h11M2.5 12h7M12 11l2 1.5-2 1.5z',
  results: 'M2.5 13.5h11M4 11V7M7 11V4M10 11V8.5M13 11V5.5',
  model: 'M5 5h6v6H5zM6.5 2v3M9.5 2v3M6.5 11v3M9.5 11v3M2 6.5h3M2 9.5h3M11 6.5h3M11 9.5h3',
  data: 'M8 6c3 0 5.5-.9 5.5-2S11 2 8 2 2.5 2.9 2.5 4 5 6 8 6zM2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2',
  memory: 'M8 2 14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3',
  search: 'M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6 14 14',
  'chevron-right': 'M6 3.5 10.5 8 6 12.5',
  'chevron-down': 'M3.5 6 8 10.5 12.5 6',
  'arrow-right': 'M2.5 8h11M9.5 4l4 4-4 4',
  'arrow-left': 'M13.5 8h-11M6.5 4l-4 4 4 4',
  external: 'M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v4H2.5V4h4',
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  check: 'M3 8.5 6.5 12 13 4.5',
  x: 'M4 4l8 8M12 4l-8 8',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  pr: 'M4.5 5.5v7M4.5 5.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5zM4.5 14a1.75 1.75 0 1 0 0-3.5M11.5 10.5V6a2 2 0 0 0-2-2H7M8.5 2.5 7 4l1.5 1.5M11.5 14a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z',
  alert: 'M8 2 14.5 13.5h-13zM8 6.5v3.5M8 11.75v.5',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v4M8 5v.5',
  flask: 'M6 2h4M6.5 2v4.5L3 12.5A1 1 0 0 0 3.9 14h8.2a1 1 0 0 0 .9-1.5L9.5 6.5V2M4.8 10h6.4',
  file: 'M9 1.5H4v13h8V4.5zM9 1.5v3h3M6 8.5 4.75 10 6 11.5M10 8.5l1.25 1.5L10 11.5',
  clock: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5',
  hypothesis: 'M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 11.75v.5M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z',
  graph: 'M3.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM3.5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 3.5c4 0 3 4.5 6 4.5M5 12.5c4 0 3-4.5 6-4.5',
  timeline: 'M4 2v12M4 4h9M4 8h6M4 12h8',
  summary: 'M2.5 2.5h11v11h-11zM5 5.5h6M5 8h6M5 10.5h3.5',
  github:
    'M6 13c-3 1-3-1.5-4.5-2M10 14.5v-2.3c0-.7.1-1-.3-1.4 1.8-.2 3.8-.9 3.8-4a3.1 3.1 0 0 0-.9-2.2 2.9 2.9 0 0 0-.1-2.1s-.7-.2-2.3.9a7.9 7.9 0 0 0-4.2 0C4.4 2.3 3.7 2.5 3.7 2.5a2.9 2.9 0 0 0-.1 2.1 3.1 3.1 0 0 0-.9 2.2c0 3.1 2 3.8 3.8 4-.4.4-.4.8-.3 1.4v2.3',
  globe: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM1.5 8h13M8 1.5c1.8 2 2.6 4.1 2.6 6.5S9.8 12.5 8 14.5C6.2 12.5 5.4 10.4 5.4 8S6.2 3.5 8 1.5z',
  play: 'M5 3v10l8-5z',
  shield: 'M8 1.5 13.5 3.5v4c0 3.3-2.3 6-5.5 7-3.2-1-5.5-3.7-5.5-7v-4zM5.5 8l2 2 3-3.5',
  terminal: 'M2.5 3h11v10h-11zM5 6.5 7 8.5 5 10.5M8.5 10.5H11',
  filter: 'M2.5 3.5h11L9.5 8.5v4l-3 1.5v-5.5z',
  plus: 'M8 3v10M3 8h10',
  book: 'M2.5 3h4a1.5 1.5 0 0 1 1.5 1.5V13a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3h-4A1.5 1.5 0 0 0 8 4.5V13a1.5 1.5 0 0 1 1.5-1.5h4z',
  pause: 'M5.5 3.5v9M10.5 3.5v9',
  restart: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v3h3',
  dot: 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  'x-circle': 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5',
  'minus-circle': 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.25 8h5.5',
  'help-circle': 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.25 6.25a1.8 1.8 0 1 1 2.5 1.65c-.45.2-.75.6-.75 1.1v.25M8 11.25v.25',
} as const

export type DIconName = keyof typeof PATHS

export function DIcon({ name, size = 16, className }: { name: DIconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
