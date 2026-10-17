import React, {memo, useEffect, useRef, useState} from 'react'
import {CheckCheck, FileCheck2, ShieldCheck, Users} from 'lucide-react'

const PERIOD = 9.6
const ELECTRIC_WINDOWS = [{start: .2, end: 1.8}, {start: 3, end: 4.8}, {start: 6, end: 7.8}]
const INBOUND_WINDOWS = [{path: 0, start: .12, end: 1.75}, {path: 1, start: 4.88, end: 5.88}, {path: 2, start: 7.88, end: 8.92}]
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export const BinaryBackdrop = memo(function BinaryBackdrop({containerRef}) {
  const [rows, setRows] = useState(48)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const resize = new ResizeObserver(entries => {
      const next = Math.ceil(entries[0].contentRect.height / 24) + 4
      setRows(previous => previous === next ? previous : next)
    })
    resize.observe(container)
    return () => resize.disconnect()
  }, [containerRef])

  return <div className="login-binary" aria-hidden="true">
    {Array.from({length: 12}, (_, column) => {
      // Short groups and deliberate gaps keep the binary a quiet texture.
      const lines = Array.from({length: rows}, (_, row) => {
        if ((row + column * 3) % 6 < 2 || (row * 3 + column) % 11 === 0) return ' '
        return ['01', '1010', '10', '0101', '1', '0'][(row * 5 + column * 7) % 6]
      }).join('\n') + '\n'
      return <div className="login-binary-column" key={column} style={{'--login-column': column, '--login-binary-duration': `${30 + column * 7 % 16}s`, '--login-binary-delay': `${-(column * 3.7)}s`, '--login-binary-opacity': .06 + column % 3 * .02}}><span>{lines}</span><span>{lines}</span></div>
    })}
  </div>
})

function cubicPoint(route, t) {
  const v = 1 - t
  return {
    x: v ** 3 * route[0].x + 3 * v * v * t * route[1].x + 3 * v * t * t * route[2].x + t ** 3 * route[3].x,
    y: v ** 3 * route[0].y + 3 * v * v * t * route[1].y + 3 * v * t * t * route[2].y + t ** 3 * route[3].y
  }
}

function sampledPath(route) {
  const samples = [{t: 0, distance: 0}]
  let distance = 0
  let previous = route[0]
  for (let i = 1; i <= 80; i++) {
    const point = cubicPoint(route, i / 80)
    distance += Math.hypot(point.x - previous.x, point.y - previous.y)
    samples.push({t: i / 80, distance})
    previous = point
  }
  return {route, samples, length: distance}
}

function pathPoint(path, ratio) {
  const distance = clamp(ratio) * path.length
  let low = 0
  let high = path.samples.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (path.samples[middle].distance < distance) low = middle + 1
    else high = middle
  }
  const next = path.samples[low]
  const previous = path.samples[Math.max(0, low - 1)]
  const mix = (distance - previous.distance) / (next.distance - previous.distance || 1)
  return cubicPoint(path.route, previous.t + (next.t - previous.t) * mix)
}

export const HologramScene = memo(function HologramScene({pageRef}) {
  const sceneRef = useRef(null)
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const coreRef = useRef(null)
  const nodeRefs = useRef([])

  useEffect(() => {
    const scene = sceneRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    const core = coreRef.current
    const page = pageRef.current
    const nodes = nodeRefs.current
    const context = canvas.getContext('2d')
    if (!context) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const accent = '#137fa4'
    let alive = true
    let frame = 0
    let width = 0
    let height = 0
    let elapsed = 0
    let previousFrame = 0
    let sceneVisible = true
    let pageVisible = true
    let paths = []
    let lastNode = -2
    let lastPhase = ''
    const moving = () => !reduced.matches
    const drawable = () => alive && !document.hidden && sceneVisible && pageVisible

    function requestDraw() {
      if (!frame && drawable()) frame = requestAnimationFrame(draw)
    }

    function syncMotion() {
      page.dataset.loginMotion = document.hidden || !pageVisible ? 'paused' : 'running'
      scene.dataset.loginMotion = document.hidden || !sceneVisible || !pageVisible ? 'paused' : 'running'
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      previousFrame = 0
      if (reduced.matches) stage.style.transform = ''
      requestDraw()
    }

    function layout() {
      if (!alive) return
      width = stage.clientWidth
      height = stage.clientHeight
      if (!width || !height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cx = width * .5
      const cy = height * .45
      const source = {x: nodes[0].offsetLeft + nodes[0].offsetWidth, y: nodes[0].offsetTop + nodes[0].offsetHeight / 2}
      const validation = {x: nodes[1].offsetLeft, y: nodes[1].offsetTop + nodes[1].offsetHeight / 2}
      const followup = {x: width * .5, y: nodes[2].offsetTop}
      paths = [
        [source, {x: source.x + 20, y: source.y}, {x: cx - 40, y: cy}, {x: cx, y: cy}],
        [{x: cx, y: cy}, {x: cx + 50, y: cy}, {x: validation.x - 23, y: validation.y}, validation],
        [{x: cx, y: cy}, {x: cx + 12, y: cy + 40}, {x: followup.x, y: followup.y - 30}, followup]
      ].map(sampledPath)
      requestDraw()
    }

    function dot(x, y, radius, color, alpha = 1) {
      context.globalAlpha = alpha
      context.fillStyle = color
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
    }

    function polyline(points) {
      context.beginPath()
      points.forEach((point, index) => {
        if (!index) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
    }

    function electric(path, head, envelope) {
      const arc = []
      const span = Math.min(.72, 105 / path.length)
      const segments = Math.max(9, Math.min(28, Math.round(span * path.length / 4)))
      const amplitude = Math.min(1, path.length / 95)
      for (let i = 0; i <= segments; i++) {
        const u = i / segments
        const position = head - span * (1 - u)
        if (position < 0) continue
        const point = pathPoint(path, position)
        const before = pathPoint(path, position - .006)
        const after = pathPoint(path, position + .006)
        const dx = after.x - before.x
        const dy = after.y - before.y
        const length = Math.hypot(dx, dy) || 1
        const noise = ((i % 2 ? 1 : -1) * 5.1 + Math.sin(i * 2.3 + elapsed * 14) * 2.3) * Math.sin(Math.PI * u) * 1.2 * amplitude
        arc.push({x: point.x - dy / length * noise, y: point.y + dx / length * noise})
      }
      if (arc.length < 2) return
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.shadowColor = '#3bcdef'
      context.shadowBlur = width < 330 ? 12 : 18
      context.globalAlpha = envelope * .36
      context.strokeStyle = '#299ee5'
      context.lineWidth = width < 330 ? 5.8 : 7.5
      polyline(arc)
      context.stroke()
      context.shadowBlur = 0
      context.globalAlpha = envelope * .97
      context.strokeStyle = '#2377cc'
      context.lineWidth = width < 330 ? 2.2 : 2.8
      polyline(arc)
      context.stroke()
      context.globalAlpha = envelope * .95
      context.strokeStyle = '#e3fcff'
      context.lineWidth = .85
      polyline(arc)
      context.stroke()
      if (arc.length > 12) {
        for (let fork = 0; fork < 2; fork++) {
          const branch = arc.slice(3 + fork * 7, 12 + fork * 7).map((point, i) => ({x: point.x + Math.sin(i * 1.2 + fork) * 6, y: point.y + (fork ? -1 : 1) * 13 * Math.sin(i * Math.PI / 8)}))
          context.globalAlpha = envelope * (fork ? .45 : .65)
          context.strokeStyle = '#2586dd'
          context.lineWidth = 1.1
          polyline(branch)
          context.stroke()
        }
      }
      const point = pathPoint(path, head)
      context.shadowBlur = 14
      context.shadowColor = '#35cbe6'
      dot(point.x, point.y, 2.9, '#167bbd', envelope)
      dot(point.x, point.y, 1.2, '#e3feff', envelope)
      context.shadowBlur = 0
      for (let i = 1; i <= 3; i++) {
        const t = head - span - i * .027
        if (t < 0) continue
        const tail = pathPoint(path, t)
        dot(tail.x, tail.y, 1.1, accent, envelope * (.36 - i * .07))
      }
    }

    function incomingData(path, progress, index) {
      const reverse = index !== 0
      const count = path.length > 180 ? 3 : path.length > 90 ? 2 : 1
      for (let packet = 0; packet < count; packet++) {
        const u = progress * (1 + .38 * (count - 1)) - packet * .38
        if (u < 0 || u > 1) continue
        const ratio = reverse ? 1 - u : u
        const point = pathPoint(path, ratio)
        const ahead = pathPoint(path, reverse ? ratio - .012 : ratio + .012)
        const behind = pathPoint(path, reverse ? ratio + .012 : ratio - .012)
        const dx = ahead.x - behind.x
        const dy = ahead.y - behind.y
        const length = Math.hypot(dx, dy) || 1
        const offset = index === 0 ? -13 : 12
        const x = point.x - dy / length * offset
        const y = point.y + dx / length * offset
        const alpha = clamp(u / .1) * clamp((1 - u) / .16)
        context.globalAlpha = alpha * .85
        context.strokeStyle = '#358bbf'
        context.lineWidth = 1.1
        context.beginPath()
        context.moveTo(point.x - dx / length * 11, point.y - dy / length * 11)
        context.lineTo(point.x, point.y)
        context.stroke()
        context.fillStyle = '#f6fdff'
        context.strokeStyle = '#59a9cb'
        context.lineWidth = .7
        context.beginPath()
        context.roundRect(x - 15, y - 7, 30, 14, 3)
        context.fill()
        context.stroke()
        context.fillStyle = '#1a679a'
        context.font = '600 9px Consolas,monospace'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(['0101', '1010', '1100'][(packet + index) % 3], x, y + .2)
        context.fillStyle = '#2288b6'
        context.beginPath()
        context.moveTo(point.x + dx / length * 3, point.y + dy / length * 3)
        context.lineTo(point.x - dy / length * 2.2, point.y + dx / length * 2.2)
        context.lineTo(point.x + dy / length * 2.2, point.y - dx / length * 2.2)
        context.closePath()
        context.fill()
      }
    }

    function draw(now) {
      frame = 0
      if (!drawable() || !width || !height || !paths.length) return
      if (moving() && previousFrame && now - previousFrame < 32) {
        requestDraw()
        return
      }
      if (moving() && previousFrame) elapsed += Math.min((now - previousFrame) / 1000, .1)
      previousFrame = now
      const cycle = elapsed % PERIOD
      const active = moving() ? ELECTRIC_WINDOWS.findIndex(window => cycle >= window.start && cycle < window.end) : -1
      const incoming = moving() ? INBOUND_WINDOWS.find(window => cycle >= window.start && cycle < window.end) : undefined
      const scanning = moving() && cycle >= 1.8 && cycle < 2.65
      const scanT = clamp((cycle - 1.8) / .85)
      const phase = scanning ? 'core-scan' : active === 0 ? 'source-current' : active === 1 ? 'validation-current' : active === 2 ? 'followup-current' : incoming ? `inbound-${incoming.path}` : 'settle'
      if (lastPhase !== phase) {
        lastPhase = phase
        stage.dataset.phase = phase
        core.classList.toggle('login-core-scanning', scanning)
      }
      const lit = moving() ? cycle < 1.8 ? 0 : cycle >= 3 && cycle < 5.88 ? 1 : cycle >= 6 && cycle < 8.92 ? 2 : -1 : -1
      if (lastNode !== lit) {
        lastNode = lit
        nodes.forEach((node, index) => node.classList.toggle('login-node-active', index === lit))
      }
      core.style.setProperty('--login-scan-top', `${(-15 + scanT * 125).toFixed(1)}%`)
      core.style.setProperty('--login-scan-opacity', scanning ? (Math.sin(scanT * Math.PI) * .65).toFixed(2) : '0')
      if (moving()) stage.style.transform = `rotateX(${(.7 * Math.sin(elapsed * .18)).toFixed(2)}deg) rotateY(${(1.1 * Math.sin(elapsed * .12)).toFixed(2)}deg)`

      context.clearRect(0, 0, width, height)
      paths.forEach((path, index) => {
        const route = path.route
        context.strokeStyle = '#458caf'
        context.lineWidth = .9
        context.globalAlpha = index === active ? .42 : .22
        context.beginPath()
        context.moveTo(route[0].x, route[0].y)
        context.bezierCurveTo(route[1].x, route[1].y, route[2].x, route[2].y, route[3].x, route[3].y)
        context.stroke()
        if (index === active) {
          const window = ELECTRIC_WINDOWS[index]
          const t = (cycle - window.start) / (window.end - window.start)
          const envelope = clamp(t / .08) * clamp((1 - t) / .12)
          electric(path, t, envelope)
          if (t > .18) electric(path, (t - .18) / .82, envelope * .55)
        } else if (!moving()) {
          const point = pathPoint(path, .55)
          dot(point.x, point.y, 1.4, accent, .45)
        }
      })
      if (incoming) incomingData(paths[incoming.path], (cycle - incoming.start) / (incoming.end - incoming.start), incoming.path)

      const cx = width * .5
      const cy = height * .45
      const radius = Math.min(width * .285, height * .295)
      const yaw = elapsed * Math.PI / 20
      const pitch = -.26
      const reception = moving() ? cycle >= 5.88 && cycle < 6.3 ? Math.sin((cycle - 5.88) / .42 * Math.PI) : cycle >= 8.92 && cycle < 9.4 ? Math.sin((cycle - 8.92) / .48 * Math.PI) : 0 : 0
      core.classList.toggle('login-core-receiving', reception > .12)
      const halo = context.createRadialGradient(cx, cy, 12, cx, cy, radius * 1.6)
      halo.addColorStop(0, '#54bfe51a')
      halo.addColorStop(1, 'transparent')
      context.globalAlpha = 1
      context.fillStyle = halo
      context.fillRect(cx - radius * 1.6, cy - radius * 1.6, radius * 3.2, radius * 3.2)

      function project(x, y, z) {
        const xx = x * Math.cos(yaw) + z * Math.sin(yaw)
        const zz = -x * Math.sin(yaw) + z * Math.cos(yaw)
        return [cx + xx * radius, cy + (y * Math.cos(pitch) - zz * Math.sin(pitch)) * radius]
      }
      context.strokeStyle = accent
      context.lineWidth = .6
      for (let meridian = 0; meridian < 10; meridian++) {
        const longitude = meridian * Math.PI / 5
        context.beginPath()
        for (let i = 0; i <= 44; i++) {
          const latitude = -Math.PI / 2 + i * Math.PI / 44
          const point = project(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude))
          if (!i) context.moveTo(...point)
          else context.lineTo(...point)
        }
        context.globalAlpha = .17
        context.stroke()
      }
      for (let latitudeIndex = -3; latitudeIndex <= 3; latitudeIndex++) {
        const latitude = latitudeIndex * Math.PI / 8
        context.beginPath()
        for (let i = 0; i <= 56; i++) {
          const longitude = i * Math.PI / 28
          const point = project(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude))
          if (!i) context.moveTo(...point)
          else context.lineTo(...point)
        }
        context.globalAlpha = .18
        context.stroke()
      }
      for (let ring = 0; ring < 2; ring++) {
        const tilt = ring ? -.64 : .44
        const rx = radius * (1.45 + ring * .15)
        const ry = radius * .49
        const orbit = angle => {
          const x = Math.cos(angle) * rx
          const y = Math.sin(angle) * ry
          return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]
        }
        context.globalAlpha = .23
        context.lineWidth = .75
        context.beginPath()
        for (let i = 0; i <= 72; i++) {
          const point = orbit(i * Math.PI / 36)
          if (!i) context.moveTo(...point)
          else context.lineTo(...point)
        }
        context.stroke()
        const angle = elapsed * (ring ? -Math.PI / 12 : Math.PI / 9) + ring * 2
        context.beginPath()
        for (let i = 0; i < 16; i++) {
          const point = orbit(angle - i * .012)
          if (!i) context.moveTo(...point)
          else context.lineTo(...point)
        }
        context.globalAlpha = .52
        context.lineWidth = 1
        context.stroke()
        const point = orbit(angle)
        dot(point[0], point[1], 1.7, accent, .65)
      }
      if (scanning || reception > 0) {
        context.globalAlpha = scanning ? Math.sin(scanT * Math.PI) * .42 : reception * .36
        context.strokeStyle = accent
        context.lineWidth = scanning ? 1 : 1.7
        const scale = scanning ? .8 + scanT * .55 : .73 + reception * .4
        context.beginPath()
        context.ellipse(cx, cy, radius * scale, radius * scale * .86, 0, 0, Math.PI * 2)
        context.stroke()
      }
      for (let i = 0; i < 15; i++) {
        const x = (Math.sin(i * 71.13) * .5 + .5) * width
        const y = ((Math.cos(i * 21.43) * .5 + .5) * height - elapsed * (1 + i % 3) + height * 1000) % height
        dot(x, y, i % 5 === 0 ? .85 : .5, accent, .12)
      }
      context.globalAlpha = 1
      if (moving()) requestDraw()
    }

    const resize = new ResizeObserver(layout)
    resize.observe(stage)
    nodes.forEach(node => resize.observe(node))
    const sceneIntersection = new IntersectionObserver(entries => {
      sceneVisible = entries[0].isIntersecting
      syncMotion()
    })
    sceneIntersection.observe(scene)
    const pageIntersection = new IntersectionObserver(entries => {
      pageVisible = entries[0].isIntersecting
      syncMotion()
    })
    pageIntersection.observe(page)
    document.addEventListener('visibilitychange', syncMotion)
    reduced.addEventListener('change', syncMotion)
    document.fonts?.ready.then(() => { if (alive) layout() })
    layout()
    syncMotion()

    return () => {
      alive = false
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      sceneIntersection.disconnect()
      pageIntersection.disconnect()
      document.removeEventListener('visibilitychange', syncMotion)
      reduced.removeEventListener('change', syncMotion)
      delete page.dataset.loginMotion
    }
  }, [pageRef])

  return <div className="login-scene" ref={sceneRef} role="img" aria-label="Ilustrasi hologram: aliran listrik bergantian dan paket data bergerak dari Monitoring SDM, Rekonsiliasi, dan Tindak lanjut menuju inti.">
    <div className="login-stage" ref={stageRef} aria-hidden="true">
      <canvas className="login-scene-canvas" ref={canvasRef}/>
      <div className="login-ring-glow"/>
      <div className="login-projection"/>
      <div className="login-core-wrap" ref={coreRef}><div className="login-core"><span className="login-shield"><ShieldCheck size={46} strokeWidth={1.25}/></span></div></div>
      <div className="login-node login-node-source" ref={node => { nodeRefs.current[0] = node }}><Users size={20}/><span><small>SUMBER DATA</small>Monitoring SDM</span></div>
      <div className="login-node login-node-validation" ref={node => { nodeRefs.current[1] = node }}><FileCheck2 size={20}/><span><small>VALIDASI</small>Rekonsiliasi</span></div>
      <div className="login-node login-node-followup" ref={node => { nodeRefs.current[2] = node }}><CheckCheck size={18}/><span>Tindak lanjut</span></div>
    </div>
  </div>
})
