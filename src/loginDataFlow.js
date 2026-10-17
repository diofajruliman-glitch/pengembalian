export function drawModuleData(context, pointAt, pathLength, phase, scale = 1, opacity = 1) {
  if (!(pathLength > 0) || !Number.isFinite(phase) || scale <= 0 || opacity <= 0) return
  const ease = value => {
    const t = Math.max(0, Math.min(1, value))
    return t * t * (3 - 2 * t)
  }

  context.save()
  try {
    context.shadowBlur = 0
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (let packet = 0; packet < 2; packet++) {
      const packetPhase = ((phase + packet * .5) % 1 + 1) % 1
      const progress = packetPhase * 1.18 - .09
      if (progress < 0 || progress > 1) continue
      const alpha = Math.min(1, opacity) * ease(progress / .1) * ease((1 - progress) / .15)
      if (!alpha) continue
      const point = pointAt(progress)
      const before = pointAt(Math.max(0, progress - .005))
      const after = pointAt(Math.min(1, progress + .005))
      const length = Math.hypot(after.x - before.x, after.y - before.y) || 1
      const dx = (after.x - before.x) / length
      const dy = (after.y - before.y) / length

      for (let trail = 0; trail < 2; trail++) {
        const t = progress - (20 + trail * 11) * scale / pathLength
        if (t < 0 || t > 1) continue
        const square = pointAt(t)
        const size = (trail ? 1.8 : 2.4) * scale
        context.globalAlpha = alpha * (trail ? .28 : .48)
        context.fillStyle = '#58a6bd'
        context.fillRect(square.x - size / 2, square.y - size / 2, size, size)
      }

      context.globalAlpha = alpha * .42
      context.strokeStyle = '#69afc0'
      context.lineWidth = .7 * scale
      context.beginPath()
      context.moveTo(point.x - dx * 17 * scale, point.y - dy * 17 * scale)
      context.lineTo(point.x - dx * 23 * scale, point.y - dy * 23 * scale)
      context.stroke()

      // Keep the label upright; only the chevron and trace follow the route tangent.
      context.globalAlpha = alpha
      context.fillStyle = '#f4fdff'
      context.strokeStyle = '#77b8c8'
      context.lineWidth = .8 * scale
      context.beginPath()
      context.roundRect(point.x - 15 * scale, point.y - 7 * scale, 30 * scale, 14 * scale, 3 * scale)
      context.fill()
      context.stroke()
      context.fillStyle = '#276a82'
      context.font = `600 ${9 * scale}px Consolas, 'Courier New', monospace`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(packet ? '1010' : '0101', point.x, point.y + .3 * scale)

      const arrowX = point.x + dx * 20 * scale
      const arrowY = point.y + dy * 20 * scale
      context.strokeStyle = '#318ca8'
      context.lineWidth = 1 * scale
      context.beginPath()
      context.moveTo(arrowX - dx * 3 * scale - dy * 2.2 * scale, arrowY - dy * 3 * scale + dx * 2.2 * scale)
      context.lineTo(arrowX, arrowY)
      context.lineTo(arrowX - dx * 3 * scale + dy * 2.2 * scale, arrowY - dy * 3 * scale - dx * 2.2 * scale)
      context.stroke()
    }
  } finally {
    context.restore()
  }
}
