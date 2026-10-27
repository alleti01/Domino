// A real panel from the Domino console, framed as a window with the page it
// came from. The images are screenshots of this repo's dashboard.

export function DashShot({ src, where, alt, className = '' }: { src: string; where: string; alt: string; className?: string }) {
  return (
    <figure className={`ds ${className}`}>
      <div className="ds-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>
          <b>Domino</b> console · {where}
        </span>
      </div>
      <img src={src} alt={alt} loading="lazy" decoding="async" />
    </figure>
  )
}
