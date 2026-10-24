// Decorative colour shapes for the landing page, drawn in CSS so there are no
// video or image assets. All of them are hidden from screen readers by their
// containers and stop moving for people who ask for reduced motion.

/** Drifting, blurred colour clouds behind the hero (Cogent uses a video for this). */
export function Haze({ small = false }: { small?: boolean }) {
  return (
    <div className={`haze${small ? ' haze-small' : ''}`}>
      <span className="haze-blob haze-violet" />
      <span className="haze-blob haze-peach" />
      <span className="haze-blob haze-blue" />
      <span className="haze-blob haze-rose" />
    </div>
  )
}

/** A slowly turning pastel ring with a dotted arc, for light sections. */
export function HoloSwirl() {
  return (
    <div className="holo">
      <span className="holo-ring" />
      <span className="holo-ring holo-ring-inner" />
      <svg className="holo-dots" viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="186" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="0.1 9" strokeLinecap="round" />
      </svg>
    </div>
  )
}
