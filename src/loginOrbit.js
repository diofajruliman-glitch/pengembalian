const TAU = Math.PI * 2

export function orbitPoint(orbit, angle, offset = 0) {
  const x = Math.cos(angle) * (orbit.rx + offset)
  const y = Math.sin(angle) * (orbit.ry + offset)
  return {
    x: orbit.cx + x * Math.cos(orbit.tilt) - y * Math.sin(orbit.tilt),
    y: orbit.cy + x * Math.sin(orbit.tilt) + y * Math.cos(orbit.tilt)
  }
}

export function nearestOrbitAngle(orbit, x, y) {
  let nearest = {distance: Infinity, angle: 0}
  for (let i = 0; i < 180; i++) {
    const angle = i / 180 * TAU
    const point = orbitPoint(orbit, angle)
    const distance = Math.hypot(point.x - x, point.y - y)
    if (distance < nearest.distance) nearest = {distance, angle}
  }
  return nearest.angle
}

export function drawOrbitBeam(back, front, orbit, angle, elapsed, scale = 1, direction = 1) {
  const span = 1.55
  // Split the same ellipse across two layers so the beam wraps around the shield.
  ;[back, front].forEach((drawing, depth) => {
    drawing.save()
    drawing.lineCap = 'round'
    drawing.lineJoin = 'round'
    for (let chunk = 0; chunk < 10; chunk++) {
      const strength = ((chunk + 1) / 10) ** 1.6
      drawing.beginPath()
      let connected = false
      for (let i = 0; i <= 8; i++) {
        const t = (chunk + i / 8) / 10
        const a = angle - direction * span * (1 - t)
        if (Number(Math.sin(a) > 0) !== depth) {
          connected = false
          continue
        }
        const point = orbitPoint(orbit, a)
        if (connected) drawing.lineTo(point.x, point.y)
        else drawing.moveTo(point.x, point.y)
        connected = true
      }
      drawing.shadowColor = '#24c9ee'
      drawing.shadowBlur = 12 * scale
      drawing.strokeStyle = '#26a8ef'
      drawing.lineWidth = 8 * scale
      drawing.globalAlpha = strength * .2
      drawing.stroke()
      drawing.shadowBlur = 0
      drawing.strokeStyle = '#178bd1'
      drawing.lineWidth = 3.8 * scale
      drawing.globalAlpha = strength * .9
      drawing.stroke()
      drawing.strokeStyle = '#62e5ff'
      drawing.lineWidth = 2.3 * scale
      drawing.globalAlpha = strength
      drawing.stroke()
      drawing.strokeStyle = '#f0feff'
      drawing.lineWidth = .95 * scale
      drawing.stroke()
    }
    // Fine filaments flicker beside the beam; the white core stays smooth.
    for (let filament = 0; filament < 2; filament++) {
      drawing.beginPath()
      let connected = false
      for (let i = 0; i <= 42; i++) {
        const t = i / 42
        const a = angle - direction * span * (1 - t)
        if (Number(Math.sin(a) > 0) !== depth) {
          connected = false
          continue
        }
        const noise = (Math.sin(i * 2.3 + elapsed * 9 + filament * 3) * 2.5 + (filament ? -3 : 3)) * Math.sin(Math.PI * t) * scale
        const point = orbitPoint(orbit, a, noise)
        if (connected) drawing.lineTo(point.x, point.y)
        else drawing.moveTo(point.x, point.y)
        connected = true
      }
      drawing.strokeStyle = filament ? '#188ed7' : '#50cce8'
      drawing.lineWidth = .7 * scale
      drawing.globalAlpha = .6
      drawing.stroke()
    }
    drawing.restore()
  })

  const point = orbitPoint(orbit, angle)
  const drawing = Math.sin(angle) > 0 ? front : back
  drawing.save()
  drawing.globalAlpha = 1
  const glow = drawing.createRadialGradient(point.x, point.y, 0, point.x, point.y, 19 * scale)
  glow.addColorStop(0, '#f0feffff')
  glow.addColorStop(.12, '#9bf2ffdc')
  glow.addColorStop(.4, '#37cbed60')
  glow.addColorStop(1, '#37cbed00')
  drawing.fillStyle = glow
  drawing.fillRect(point.x - 19 * scale, point.y - 19 * scale, 38 * scale, 38 * scale)
  drawing.fillStyle = '#f7ffff'
  drawing.beginPath()
  drawing.arc(point.x, point.y, 2.2 * scale, 0, TAU)
  drawing.fill()
  drawing.restore()

  for (let i = 0; i < 8; i++) {
    const a = angle - direction * (.15 + i * .16)
    const offset = Math.sin(elapsed * 3 + i * 7) * (4 + i * .7)
    const spark = orbitPoint(orbit, a, offset)
    const surface = Math.sin(a) > 0 ? front : back
    surface.save()
    surface.globalAlpha = (1 - i / 8) * .65
    surface.fillStyle = i % 2 ? '#1685c5' : '#4fcce6'
    surface.beginPath()
    surface.arc(spark.x, spark.y, (i % 3 ? .65 : 1) * scale, 0, TAU)
    surface.fill()
    surface.restore()
  }
}
