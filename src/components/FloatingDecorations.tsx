import { FLOATING_DECORATIONS, type DecorationItem } from '@/data/landingDecorations'
import { useFloatingMotion } from '@/hooks/useFloatingMotion'

interface FloatingDecorationsProps {
  items?: DecorationItem[]
}

function FloatingItem({ item }: { item: DecorationItem }) {
  const style = useFloatingMotion(item)
  const size = item.size ?? '24px'

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
