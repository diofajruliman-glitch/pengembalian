import React, {memo, useEffect, useRef, useState} from 'react'
import {CheckCheck, FileCheck2, ShieldCheck, Users} from 'lucide-react'
import {drawOrbitBeam, nearestOrbitAngle, orbitPoint} from './loginOrbit'
import {drawModuleData} from './loginDataFlow'

const PERIOD = 9.6
const MODULE_PERIOD = 2.4
const TAU = Math.PI * 2
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
  const foregroundRef = useRef(null)
  const coreRef = useRef(null)
  const nodeRefs = useRef([])

  useEffect(() => {
    const scene = sceneRef.current
    const stage = stageRef.current
    const canvas = canvasRef.current
    const foreground = foregroundRef.current
    const core = coreRef.current
    const page = pageRef.current
    const nodes = nodeRefs.current
    const context = canvas.getContext('2d')
    const frontContext = foreground.getContext('2d')
    if (!context || !frontContext) return
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
    let moduleRoutes = []
    let orbits = []
    let nodeAngles = []
    let lastNodeState = ''
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
      ;[[canvas, context], [foreground, frontContext]].forEach(([surface, drawing]) => {
        surface.width = Math.round(width * dpr)
        surface.height = Math.round(height * dpr)
        drawing.setTransform(dpr, 0, 0, dpr, 0, 0)
      })
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
      moduleRoutes = paths.map((path, index) => ({
        length: path.length,
        pointAt: progress => pathPoint(path, index === 0 ? 1 - progress : progress)
      }))
      const radius = Math.min(width * .285, height * .295)
      orbits = [
        {cx, cy, rx: radius * 1.45, ry: radius * .49, tilt: .44, direction: 1, phase: Math.PI},
        {cx, cy, rx: radius * 1.6, ry: radius * .49, tilt: -.64, direction: -1, phase: Math.PI * .35}
      ]
      nodeAngles = orbits.map(orbit => nodes.map((node, index) => nearestOrbitAngle(orbit,
        node.offsetLeft + (index === 2 ? 0 : node.offsetWidth / 2),
        node.offsetTop + node.offsetHeight / 2)))
      requestDraw()
    }

    function dot(x, y, radius, color, alpha = 1) {
      context.globalAlpha = alpha
      context.fillStyle = color
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
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
      const beamAngles = orbits.map(orbit => cycle / PERIOD * TAU * orbit.direction + orbit.phase)
      const modulePhases = moduleRoutes.map((_, index) => (cycle / MODULE_PERIOD + index / moduleRoutes.length) % 1)
      const scanning = moving() && cycle >= 1.8 && cycle < 2.65
      const scanT = clamp((cycle - 1.8) / .85)
      const phase = moving() ? 'orbit-emission' : 'orbit-static'
      if (lastPhase !== phase) {
        lastPhase = phase
        stage.dataset.phase = phase
      }
      core.classList.toggle('login-core-scanning', scanning)
      const flowArriving = modulePhases.map(phase => [phase, (phase + .5) % 1].some(packet => packet >= .82 && packet < .98))
      const activeNodes = nodes.map((_, index) => moving() && (flowArriving[index] || nodeAngles.some((angles, ring) => {
        const distance = beamAngles[ring] - angles[index]
        return Math.abs(Math.atan2(Math.sin(distance), Math.cos(distance))) < .3
      })))
      const nodeState = activeNodes.map(Number).join('')
      if (lastNodeState !== nodeState) {
        lastNodeState = nodeState
        nodes.forEach((node, index) => node.classList.toggle('login-node-active', activeNodes[index]))
      }
      core.style.setProperty('--login-scan-top', `${(-15 + scanT * 125).toFixed(1)}%`)
      core.style.setProperty('--login-scan-opacity', scanning ? (Math.sin(scanT * Math.PI) * .65).toFixed(2) : '0')
      if (moving()) stage.style.transform = `rotateX(${(.7 * Math.sin(elapsed * .18)).toFixed(2)}deg) rotateY(${(1.1 * Math.sin(elapsed * .12)).toFixed(2)}deg)`

      context.clearRect(0, 0, width, height)
      frontContext.clearRect(0, 0, width, height)
      paths.forEach(path => {
        const route = path.route
        context.strokeStyle = '#458caf'
        context.lineWidth = .9
        context.globalAlpha = .16
        context.beginPath()
        context.moveTo(route[0].x, route[0].y)
        context.bezierCurveTo(route[1].x, route[1].y, route[2].x, route[2].y, route[3].x, route[3].y)
        context.stroke()
        if (!moving()) {
          const point = pathPoint(path, .55)
          dot(point.x, point.y, 1.4, accent, .45)
        }
      })
      moduleRoutes.forEach((route, index) => drawModuleData(context, route.pointAt, route.length,
        moving() ? modulePhases[index] : .35, width < 330 ? .8 : 1, moving() ? 1 : .55))

      const cx = width * .5
      const cy = height * .45
      const radius = Math.min(width * .285, height * .295)
      const yaw = elapsed * Math.PI / 20
      const pitch = -.26
      const reception = activeNodes.some(Boolean) ? .5 : 0
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
      orbits.forEach(orbit => {
        context.globalAlpha = .23
        context.lineWidth = .75
        context.beginPath()
        for (let i = 0; i <= 72; i++) {
          const point = orbitPoint(orbit, i * Math.PI / 36)
          if (!i) context.moveTo(point.x, point.y)
          else context.lineTo(point.x, point.y)
        }
        context.stroke()
      })
      if (moving()) orbits.forEach((orbit, ring) => drawOrbitBeam(context, frontContext, orbit,
        beamAngles[ring], elapsed, width < 330 ? .8 : 1, orbit.direction))
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

  return <div className="login-scene" ref={sceneRef} role="img" aria-label="Ilustrasi hologram: dua beam cahaya mengitari orbit perisai; paket aliran data berkode biner bergerak dari perisai menuju kartu Monitoring SDM, Rekonsiliasi, dan Tindak lanjut yang berpendar saat menerima data.">
    <div className="login-stage" ref={stageRef} aria-hidden="true">
      <canvas className="login-scene-canvas" ref={canvasRef}/>
      <div className="login-ring-glow"/>
      <div className="login-projection"/>
      <div className="login-core-wrap" ref={coreRef}><div className="login-core"><span className="login-shield"><ShieldCheck size={46} strokeWidth={1.25}/></span></div></div>
      <canvas className="login-scene-canvas login-scene-foreground" ref={foregroundRef}/>
      <div className="login-node login-node-source" ref={node => { nodeRefs.current[0] = node }}><Users size={20}/><span><small>SUMBER DATA</small>Monitoring SDM</span></div>
      <div className="login-node login-node-validation" ref={node => { nodeRefs.current[1] = node }}><FileCheck2 size={20}/><span><small>VALIDASI</small>Rekonsiliasi</span></div>
      <div className="login-node login-node-followup" ref={node => { nodeRefs.current[2] = node }}><CheckCheck size={18}/><span>Tindak lanjut</span></div>
    </div>
  </div>
})
