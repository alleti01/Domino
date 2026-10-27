// Middle section 1: the investigation replayed on a "machine".
// Scrolling into a stage seeks the playback there; while pinned, playback
// runs on its own clock and, when it crosses into the next stage, nudges the
// page along so scroll and story stay in step. The frame is designed at
// 1136 × 904 and scaled to fit the viewport.

import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { Investigation } from '../../../types'
import { buildScript, type ActionRow, type AgentRow, type Row, type TypedRow } from './script'

const FW = 1136
const FH = 904
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const settleK = (x: number, tau: number) => (x <= 0 ? 0 : 1 - Math.exp(-x / tau))
// A relay: dim, off, then on, in quick 34 ms steps.
const relay = (x: number) => (x < 0 ? 0 : x < 0.034 ? 0.4 : x < 0.068 ? 0 : 1)
const INK = '31,29,27'
// When each part of the intro lands, in seconds.
const IN = { head: 0.3, lede: 0.36, comb: 0.4, list: 0.56, pen: 0.34, penDur: 0.28, screen: 0.64, parts: 0.71, rules: 0.77, word: 0.81, labels: 0.85, mark: 0.88, A: 1.06, S: 1.18, L1: 1.18, L2: 1.28, END: 1.7 }

type Els = {
  el: HTMLElement
  line?: HTMLElement
  words?: HTMLElement[]
  label?: HTMLElement
  chev?: HTMLElement
  steps?: HTMLElement
  stepsIn?: HTMLElement
  lines?: { box: HTMLElement; el: HTMLElement }[]
}

export function Machine({ inv, caseId }: { inv: Investigation; caseId: string }) {
  const script = useMemo(() => buildScript(inv), [inv])
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = host.current
    if (!root) return
    const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const section = $<HTMLElement>('.m-scrolly')
    const sticky = $<HTMLElement>('.m-sticky')
    const inner = $<HTMLElement>('.m-thread-inner')
    const thread = $<HTMLElement>('.m-thread')
    const stateEl = $<HTMLElement>('.m-state')
    const riskBox = $<HTMLElement>('.m-risk')
    const riskV = $<HTMLElement>('.m-risk-v')
    const typed = $<HTMLElement>('.m-typed')
    const caret = $<HTMLElement>('.m-caret')
    const ph = $<HTMLElement>('.m-ph')
    const send = $<HTMLButtonElement>('.m-send')
    const machine = $<HTMLElement>('.m-machine')
    const list = $<HTMLElement>('.m-stages')
    const { rows, cuts, labels, end } = script
    const N = labels.length

    // ---- Build the thread ----
    const els = new Map<Row, Els>()
    inner.replaceChildren()
    for (const r of rows) {
      const el = document.createElement('div')
      el.hidden = true
      if (r.kind === 'action') {
        el.className = 'm-row m-act'
        el.innerHTML = '<button class="m-head" type="button"><span class="m-label"></span><span class="m-chev" aria-hidden="true">›</span></button><div class="m-steps"><div class="m-steps-in"></div></div>'
        const stepsIn = el.querySelector<HTMLElement>('.m-steps-in')!
        const lines = r.lines.map(() => {
          const box = document.createElement('span')
          box.className = 'm-rl'
          box.hidden = true
          const s = document.createElement('span')
          box.appendChild(s)
          stepsIn.appendChild(box)
          return { box, el: s }
        })
        const head = el.querySelector<HTMLButtonElement>('.m-head')!
        if (r.tone === 'accent') head.disabled = true
        els.set(r, { el, label: el.querySelector('.m-label')!, chev: el.querySelector('.m-chev')!, steps: el.querySelector('.m-steps')!, stepsIn, lines })
      } else {
        el.className = `m-row m-line-row${r.kind === 'engineer' ? ' me' : ''}`
        const p = document.createElement('p')
        p.className = 'm-line'
        let words: HTMLElement[] | undefined
        if (r.kind === 'agent') {
          words = r.words.map((w, i) => {
            const s = document.createElement('span')
            s.textContent = w
            p.appendChild(s)
            if (i < r.words.length - 1) p.appendChild(document.createTextNode(' '))
            return s
          })
        } else p.textContent = r.text
        el.appendChild(p)
        els.set(r, { el, line: p, words })
      }
      inner.appendChild(els.get(r)!.el)
    }

    // ---- Stage list ----
    list.replaceChildren()
    const stages = labels.map((label, i) => {
      const li = document.createElement('li')
      li.className = 'm-st up'
      li.innerHTML = `<span class="m-ln"></span>${i === N - 1 ? '<span class="m-ln b"></span>' : ''}<span class="m-prog"></span><button type="button"><span class="m-num">0${i + 1}</span><span class="m-lab"></span></button>`
      li.querySelector('.m-lab')!.textContent = label
      li.querySelector('button')!.addEventListener('click', () => goTo(i))
      list.appendChild(li)
      return { li, prog: li.querySelector<HTMLElement>('.m-prog')!, btn: li.querySelector<HTMLButtonElement>('button')!, start: cuts[i], end: cuts[i + 1] }
    })
    const PLAY_END = stages[N - 1].end

    // ---- Text effects ----
    const setText = (el: HTMLElement, text: string) => {
      if (el.textContent !== text) el.textContent = text
    }
    const widths = new Map<string, number>()
    const widthOf = (el: HTMLElement) => {
      const k = el.textContent + '|' + el.className
      if (!widths.has(k)) widths.set(k, el.offsetWidth)
      return widths.get(k)!
    }
    // A highlight sweeps across text that is still in progress.
    const shimmer = (el: HTMLElement, t: number, t0: number) => {
      if (!el.classList.contains('shim')) {
        el.classList.add('shim')
        el.style.color = ''
      }
      const W = widthOf(el)
      const bw = 56
      const speed = 170
      const sweep = (W + bw) / speed
      const P = sweep + 0.3
      const ph2 = (((t - t0) % P) + P) % P
      const x = reduce ? W + bw : ph2 < sweep ? ph2 * speed - bw : W + bw
      el.style.backgroundPosition = `${x.toFixed(1)}px 0, 0 0`
    }
    // Resolved text flashes bright, then settles to its resting ink.
    const settle = (el: HTMLElement, t: number, at: number, rest: number, tone: ActionRow['tone'] = null) => {
      if (el.classList.contains('shim')) {
        el.classList.remove('shim')
        el.style.backgroundPosition = ''
      }
      const k = Math.exp(-(t - at) / 0.28)
      if (tone === 'accent' || tone === 'fail') {
        el.style.color = ''
        el.style.textShadow = k > 0.01 ? `0 0 6px rgba(${tone === 'fail' ? '229,72,77' : '240,138,50'},${(0.9 * k).toFixed(3)})` : ''
      } else el.style.color = `rgba(${INK},${(rest + (0.98 - rest) * k).toFixed(3)})`
    }
    // A sent message lands dimmed, then lights once it is delivered.
    const land = (r: TypedRow, el: HTMLElement, line: HTMLElement, t: number) => {
      const a = reduce ? 1 : clamp01((t - r.at) / 0.18)
      const e = 1 - (1 - a) * (1 - a)
      const lit = reduce ? 1 : 0.5 + 0.5 * easeIO(clamp01((t - r.at - 0.6) / 0.3))
      const o = e * lit
      el.style.opacity = o > 0.999 ? '' : o.toFixed(3)
      line.style.transform = e > 0.999 ? '' : `translateY(${((1 - e) * 3).toFixed(2)}px)`
    }

    const endOf = (r: Row) => (r.kind === 'agent' ? r.at + (r.words.length - 1) * r.stag + 0.22 : r.kind === 'action' ? Math.max(r.done.at, ...r.lines.map((l) => l.at)) : r.at)
    const stateAt = (t: number) => {
      let last: Row | null = null
      for (const r of rows) {
        if (r.kind === 'engineer' && t >= r.typeStart && t < r.at) return 'engineer typing'
        if (r.kind === 'action' && t >= r.at && t < r.done.at) return 'working'
        if (r.kind === 'agent' && t >= r.at && t < endOf(r)) return 'domino writing'
        if (t >= r.at) last = r
      }
      if (!last) return 'waiting'
      if (last === rows[rows.length - 1]) return 'decided'
      return last.kind === 'agent' ? 'waiting' : 'thinking'
    }
    let stateTxt = ''
    let flipAt = -1
    const showState = (word: string) => {
      const now = performance.now()
      if (word !== stateTxt) {
        stateTxt = word
        setText(stateEl, word)
        flipAt = now
      }
      stateEl.classList.toggle('relay', now - flipAt < 34)
    }

    // ---- One frame of playback ----
    const render = (t: number) => {
      let typing: TypedRow | null = null
      for (const r of rows) {
        const e = els.get(r)!
        const show = t >= r.at
        if (e.el.hidden === show) e.el.hidden = !show
        if (r.kind === 'engineer' && t >= r.typeStart && t < r.at) typing = r
        if (!show) continue
        if (r.kind === 'engineer') land(r, e.el, e.line!, t)
        if (r.kind === 'agent') {
          ;(r as AgentRow).words.forEach((_, i) => {
            let o = reduce ? 1 : clamp01((t - (r.at + i * r.stag)) / 0.22)
            o = 1 - (1 - o) * (1 - o)
            const w = e.words![i]
            const v = o.toFixed(3)
            if (w.style.opacity !== v) w.style.opacity = v
          })
        }
        if (r.kind === 'action') {
          const doneNow = t >= r.done.at
          e.el.classList.toggle('ok', doneNow && r.tone === 'accent')
          e.el.classList.toggle('bad', doneNow && r.tone === 'fail')
          if (doneNow) {
            setText(e.label!, r.done.text)
            e.label!.classList.toggle('done-accent', r.tone === 'accent')
            e.label!.classList.toggle('done-fail', r.tone === 'fail')
            settle(e.label!, t, r.done.at, 0.66, r.tone)
          } else {
            let p = r.phases[0]
            for (const q of r.phases) if (t >= q.at) p = q
            setText(e.label!, p.text)
            shimmer(e.label!, t, r.at)
          }
          r.lines.forEach((l, i) => {
            const L = e.lines![i]
            const vis = t >= (l.pendAt ?? l.at)
            if (L.box.hidden === vis) L.box.hidden = !vis
            if (!vis) return
            const failLine = /failed/.test(l.text)
            if (t >= l.at) {
              setText(L.el, l.text)
              settle(L.el, t, l.at, 0.86, failLine ? 'fail' : null)
              L.el.classList.toggle('m-failtxt', failLine)
            } else {
              setText(L.el, l.pend ?? '')
              shimmer(L.el, t, r.at + 0.12 * (i + 1))
            }
          })
          const open = r.collapseAt != null && t >= r.collapseAt ? 1 - easeIO(clamp01((t - r.collapseAt) / 0.3)) : 1
          const full = e.stepsIn!.offsetHeight
          const h = open > 0.999 ? '' : `${(full * open).toFixed(1)}px`
          if (e.steps!.style.height !== h) e.steps!.style.height = h
          e.stepsIn!.style.opacity = (open * open).toFixed(3)
          e.chev!.style.transform = `rotate(${(90 * open).toFixed(1)}deg)`
        }
      }
      // The risk readout follows the latest assessment.
      let cur: string | null = null
      let curAt = 0
      let reading = false
      let readAt = 0
      for (const r of rows)
        if (r.kind === 'action')
          for (const l of r.lines)
            if (l.risk) {
              if (t >= l.at) {
                cur = l.risk
                curAt = l.at
              } else if (l.pendAt != null && t >= l.pendAt) {
                reading = true
                readAt = l.pendAt
              }
            }
      riskBox.hidden = !(cur || reading)
      if (reading) {
        setText(riskV, cur ?? 'Assessing')
        shimmer(riskV, t, readAt)
      } else if (cur) {
        setText(riskV, cur)
        settle(riskV, t, curAt, 0.86)
      }
      // The composer types the engineer's message, then sends it.
      if (typing) {
        let s = ''
        for (const [st, tx] of typing.states) {
          if (t >= st) s = tx
          else break
        }
        setText(typed, s)
      } else setText(typed, '')
      ph.hidden = typed.textContent!.length > 0
      caret.style.visibility = typing || t % 1.06 < 0.53 ? 'visible' : 'hidden'
      const down = rows.some((r) => r.kind === 'engineer' && t >= r.at - 0.12 && t < r.at)
      send.disabled = !(typed.textContent!.length > 0 || down)
      send.classList.toggle('down', down)
    }

    // Keep the newest line in view; fade the edges when content runs past them.
    let lastH = 0
    const stick = () => {
      const h = inner.scrollHeight
      if (h !== lastH) {
        lastH = h
        thread.scrollTop = thread.scrollHeight
      }
      thread.classList.toggle('up', thread.scrollTop > 1)
    }

    // ---- Scroll ↔ playback ----
    const pinAt = () => parseFloat(getComputedStyle(sticky).top) || 0
    const range = () => {
      const r = section.getBoundingClientRect()
      const at = pinAt()
      return { r, at, len: r.height - (innerHeight - at) }
    }
    const goTo = (i: number) => {
      const { r, at, len } = range()
      scrollTo({ top: scrollY + r.top - at + ((i + 0.08) * len) / N, behavior: reduce ? 'auto' : 'smooth' })
    }
    const activeIndex = () => {
      const { r, at, len } = range()
      if (r.top > innerHeight * 0.35) return -1
      return Math.min(N - 1, Math.max(0, Math.floor(((at - r.top) / len) * N)))
    }
    const stageAt = (t: number) => {
      let k = -1
      for (let i = 0; i < N; i++) if (t >= stages[i].start) k = i
      return k
    }
    const stageY = (i: number) => {
      const { r, at, len } = range()
      return Math.round(scrollY + r.top - at + ((i + 0.08) * len) / N)
    }
    let userAt = -1e9
    let syncY: number | null = null
    const mark = () => {
      userAt = performance.now()
    }
    const onScroll = () => {
      if (syncY != null && Math.abs(scrollY - syncY) < 2) return
      syncY = null
      mark()
    }
    const opts = { passive: true } as const
    ;['wheel', 'touchmove', 'pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, mark, opts))
    addEventListener('scroll', onScroll, opts)

    // ---- Intro: the machine is drawn, stamped and switched on ----
    const left = [
      [$<HTMLElement>('.m-left .m-h2'), IN.head],
      [$<HTMLElement>('.m-left .m-lede'), IN.lede],
    ] as const
    const bp = [...root.querySelectorAll<SVGElement>('.m-bp [data-k]')]
    const chassis = $<HTMLElement>('.m-chassis')
    const screen = $<HTMLElement>('.m-screen')
    const foot = $<HTMLElement>('.m-foot')
    const lamp = $<HTMLElement>('.m-pk-lamp')
    let introAt: number | null = null
    let introDone = reduce
    const renderIntro = (i: number) => {
      const done = i >= IN.END
      for (const [el, at] of left) el.style.opacity = done ? '' : String(relay(i - at))
      stages.forEach((st, k) => {
        st.li.querySelectorAll<HTMLElement>('.m-ln').forEach((ln, j) => {
          ln.style.transform = done ? '' : `scaleX(${clamp01((i - IN.comb - 0.025 * (k + j)) / 0.16)})`
        })
        st.btn.style.opacity = done ? '' : String(relay(i - IN.list))
      })
      const stampOf: Record<string, number> = { chassis: IN.pen, parts: IN.parts, screen: IN.screen, rule: IN.rules, field: IN.rules }
      const cutOf: Record<string, number> = { chassis: IN.A, parts: IN.A, screen: IN.S, rule: IN.L2, field: IN.L2 }
      for (const el of bp) {
        const k = el.dataset.k!
        const on = i >= stampOf[k] && i < cutOf[k]
        el.style.visibility = on ? '' : 'hidden'
        if (k === 'chassis') el.style.strokeDashoffset = (1000 * (1 - clamp01((i - IN.pen) / IN.penDur))).toFixed(1)
        el.classList.toggle('flash', k !== 'chassis' && i - stampOf[k] >= 0 && i - stampOf[k] < 0.034)
      }
      chassis.style.visibility = i >= IN.A ? '' : 'hidden'
      foot.style.visibility = i >= IN.A ? '' : 'hidden'
      screen.style.visibility = i >= IN.S ? '' : 'hidden'
      lamp.style.visibility = done || i >= IN.L1 ? '' : 'hidden'
      lamp.classList.toggle('relay', !done && i >= IN.L1 && i < IN.L1 + 0.034)
      machine.style.setProperty('--rlc', done ? '1' : settleK(i - IN.A, 0.28).toFixed(3))
      machine.style.setProperty('--rls', done ? '1' : settleK(i - IN.S, 0.2).toFixed(3))
      stateEl.style.opacity = done ? '' : i < IN.word ? '0' : String(relay(i - IN.word))
    }
    renderIntro(introDone ? IN.END : 0)

    // ---- Fit the 1136 × 904 frame to the viewport ----
    const fit = () => {
      const W = innerWidth
      const m = W < 900
      root.classList.toggle('is-m', m)
      const vh = innerHeight
      const pin = pinAt()
      const k = m ? Math.min(1, (vh - pin - 80) / FH, (W - 32) / 548) : Math.min(1.1, (vh - pin - 64) / FH, (Math.min(W, 1600) - 96) / FW)
      root.style.setProperty('--k', Math.max(0.3, k).toFixed(4))
      widths.clear()
    }
    fit()
    addEventListener('resize', fit)

    // ---- The clock ----
    let t = 0
    let started = false
    let prev = -1
    let last = performance.now()
    let near = false
    let raf = 0
    const io = new IntersectionObserver((es) => (near = es[es.length - 1].isIntersecting), { rootMargin: '100% 0px' })
    io.observe(section)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!near) {
        last = now
        return
      }
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { r, at } = range()
      const vh = innerHeight
      const visible = r.top < vh * 0.65 && r.bottom > vh * 0.35
      const pinned = r.top <= at + 0.5 && r.bottom >= vh - 0.5
      const idx = activeIndex()
      const userMoving = now - userAt < 900
      if (idx !== prev) {
        if (userMoving) {
          if (idx < prev) {
            if (idx < 0) {
              t = 0
              started = false
            } else t = stages[idx].start
          } else if (idx > stageAt(t)) t = stages[idx].start
        }
        prev = idx
      }
      if (!started && idx >= 0) {
        started = true
        if (idx > 0 && t === 0) t = stages[idx].start
      }
      if (introAt === null && visible) introAt = now
      if (started && visible && introDone && t < PLAY_END) t = Math.min(PLAY_END, t + dt)
      const cs = started ? Math.max(0, stageAt(t)) : -1
      // Playback ran into the next stage: bring the page along.
      if (pinned && !userMoving && cs > idx && idx >= 0) {
        syncY = stageY(cs)
        scrollTo(0, syncY)
        prev = cs
      }
      render(t)
      showState(stateAt(t))
      if (!introDone) {
        const i = introAt === null ? 0 : (now - introAt) / 1000
        renderIntro(i)
        if (i >= IN.END) introDone = true
      }
      stick()
      stages.forEach((st, i) => {
        const on = i === cs
        const done = t >= st.end - 0.001
        const cls = `m-st ${on ? 'on' : done ? 'done' : 'up'}`
        if (st.li.className !== cls) {
          st.li.className = cls
          st.btn.setAttribute('aria-current', on ? 'step' : 'false')
        }
        st.prog.style.transform = `scaleX(${on ? clamp01((t - st.start) / (st.end - st.start)).toFixed(4) : 0})`
      })
    }
    raf = requestAnimationFrame(frame)
    void end

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      removeEventListener('resize', fit)
      removeEventListener('scroll', onScroll)
      ;['wheel', 'touchmove', 'pointerdown', 'keydown'].forEach((ev) => removeEventListener(ev, mark))
    }
  }, [script])

  return (
    <div ref={host} className="m-host" style={{ '--k': 1 } as CSSProperties}>
      <section id="how" className="m-scrolly" aria-label={`Domino investigates: ${script.title}`}>
        <div className="m-sticky">
          <div className="m-fit">
            <div className="m-frame">
              <div className="m-left">
                <p className="g-label m-eyebrow">How it works</p>
                <h2 className="m-h2">
                  Domino investigates
                  <br />
                  like an engineer.
                </h2>
                <p className="m-lede">Replayed from a recorded run of {caseId}: the real queries, hypothesis, sandbox runs and verdict.</p>
                <ol className="m-stages" />
              </div>
              <div className="m-machine">
                <div className="m-chassis">
                  <i className="m-flat" />
                </div>
                <div className="m-screen">
                  <div className="m-sc-head">
                    <div className="m-state">waiting</div>
                    <div className="m-hdr-r">
                      <span className="m-risk" hidden>
                        <span className="m-mk">Risk</span>
                        <span className="m-risk-v" />
                      </span>
                    </div>
                  </div>
                  <div className="m-rule" />
                  <div className="m-thread" role="log" aria-label="Investigation">
                    <div className="m-thread-inner" />
                  </div>
                  <div className="m-composer">
                    <div className="m-field">
                      <div className="m-input" aria-hidden="true">
                        <span className="m-typed" />
                        <span className="m-caret" />
                        <span className="m-ph">Ask Domino about a change</span>
                      </div>
                    </div>
                    <button className="m-send" type="button" aria-label="Send" disabled tabIndex={-1}>
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8 12.8V3.6M3.9 7.6L8 3.5l4.1 4.1" />
                      </svg>
                    </button>
                  </div>
                  <div className="m-sheen" />
                </div>
                <div className="m-foot">
                  <i className="m-screw" />
                  <span className="m-mark">domino</span>
                  <span className="m-pk">
                    <i className="m-pk-lamp" />
                    Replay · {caseId}
                  </span>
                  <span className="m-dots" aria-hidden="true">
                    {Array.from({ length: 11 }, (_, i) => (
                      <i key={i} />
                    ))}
                  </span>
                  <i className="m-screw" style={{ marginLeft: 16 }} />
                </div>
                <svg className="m-bp" viewBox="0 0 548 904" aria-hidden="true">
                  <rect data-k="chassis" x=".5" y=".5" width="547" height="903" rx="14" pathLength={1000} strokeDasharray="1000" />
                  <rect data-k="screen" x=".5" y=".5" width="547" height="839" rx="14" />
                  <line data-k="rule" x1="26" y1="62.5" x2="522" y2="62.5" />
                  <rect data-k="field" x="26.5" y="760.5" width="495" height="50" rx="8" />
                  <circle data-k="parts" cx="24" cy="872" r="7.5" />
                  <circle data-k="parts" cx="524" cy="872" r="7.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
