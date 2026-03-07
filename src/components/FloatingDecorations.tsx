import type { CSSProperties } from 'react'
import { FLOATING_DECORATIONS, HOTSPOT_CX, HOTSPOT_CY, type DecorationItem } from '@/data/landingDecorations'
import { useFloatingMotion } from '@/hooks/useFloatingMotion'

interface FloatingDecorationsProps {
  items?: DecorationItem[]
}

/** Rotation so image bottom points toward hotspot. Left of hotspot → tilt left; right → tilt right. */
function rotationTowardHotspot(x: number, y: number): number {
  const dx = HOTSPOT_CX - x
  const dy = HOTSPOT_CY - y
  return (Math.atan2(dy, dx) * 180) / Math.PI - 90
}

function FloatingItem({ item }: { item: DecorationItem }) {
  const { style: motionStyle, x, y } = useFloatingMotion(item)
  const size = item.size ?? '24px'
  const rotationDeg = rotationTowardHotspot(x, y)
  const style: CSSProperties = {
    ...motionStyle,
    transformOrigin: '50% 50%',
    transform: `translate(-50%, -50%) rotate(${rotationDeg}deg)`,
  }

  return (
    <div className="floating-item" style={style}>
      {item.imageSrc ? (
        <img
          src={item.imageSrc}
          alt=""
          draggable={false}
          style={{ width: size, height: 'auto' }}
        />
      ) : (
        <div
          className="floating-placeholder"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  )
}

export function FloatingDecorations({ items }: FloatingDecorationsProps) {
  const list = items ?? FLOATING_DECORATIONS

  return (
    <div className="floating-layer">
      {list.map((item) => (
        <FloatingItem key={item.id} item={item} />
      ))}
    </div>
  )
}
