import { useRef } from 'react'
import { useAppStore } from '../store'

/** 手機虛擬搖桿（左下角） */
export function VirtualJoystick() {
  const setJoy = useAppStore((s) => s.setJoy)
  const active = useRef(false)
  const origin = useRef({ x: 0, y: 0 })
  const knob = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLDivElement>(null)

  function setFromEvent(clientX: number, clientY: number) {
    const dx = clientX - origin.current.x
    const dy = clientY - origin.current.y
    const max = 48
    const len = Math.hypot(dx, dy) || 1
    const clamped = Math.min(len, max)
    const nx = (dx / len) * clamped
    const ny = (dy / len) * clamped
    if (knob.current) {
      knob.current.style.transform = `translate(${nx}px, ${ny}px)`
    }
    setJoy(nx / max, ny / max)
  }

  function end() {
    active.current = false
    setJoy(0, 0)
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
  }

  return (
    <div
      className="joystick"
      ref={base}
      onPointerDown={(e) => {
        e.preventDefault()
        active.current = true
        const rect = e.currentTarget.getBoundingClientRect()
        origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        e.currentTarget.setPointerCapture(e.pointerId)
        setFromEvent(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!active.current) return
        setFromEvent(e.clientX, e.clientY)
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="joystick-knob" ref={knob} />
    </div>
  )
}
