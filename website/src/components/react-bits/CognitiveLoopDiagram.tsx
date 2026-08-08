import { motion } from 'framer-motion'

const nodes = [
  { id: 'perceive', label: 'Perceive', x: 12, y: 50 },
  { id: 'decide', label: 'Decide', x: 38, y: 22 },
  { id: 'act', label: 'Act', x: 62, y: 50 },
  { id: 'remember', label: 'Remember', x: 88, y: 22 },
]

const edges = [
  { from: 'perceive', to: 'decide' },
  { from: 'decide', to: 'act' },
  { from: 'act', to: 'remember' },
  { from: 'remember', to: 'perceive' },
]

function getNode(id: string) {
  return nodes.find((node) => node.id === id)!
}

/** Animated cognitive loop diagram for architecture page */
export function CognitiveLoopDiagram() {
  return (
    <div className="my-12 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-6 md:p-10">
      <svg viewBox="0 0 400 120" className="w-full" aria-label="Cognitive loop: Perceive, Decide, Act, Remember">
        <title>Cognitive loop diagram</title>
        {edges.map((edge, index) => {
          const from = getNode(edge.from)
          const to = getNode(edge.to)
          return (
            <motion.line
              key={`${edge.from}-${edge.to}`}
              x1={from.x * 4}
              y1={from.y * 1.2}
              x2={to.x * 4}
              y2={to.y * 1.2}
              stroke="rgba(91, 163, 163, 0.35)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.15 }}
            />
          )
        })}

        {nodes.map((node, index) => (
          <motion.g
            key={node.id}
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
          >
            <circle
              cx={node.x * 4}
              cy={node.y * 1.2}
              r="22"
              fill="rgba(61, 139, 139, 0.15)"
              stroke="rgba(91, 163, 163, 0.5)"
              strokeWidth="1"
            />
            <text
              x={node.x * 4}
              y={node.y * 1.2 + 4}
              textAnchor="middle"
              fill="rgba(255,255,255,0.85)"
              fontSize="11"
              fontFamily="DM Sans, system-ui, sans-serif"
            >
              {node.label}
            </text>
          </motion.g>
        ))}

        <motion.circle
          r="4"
          fill="#B8860B"
          initial={{ offsetDistance: '0%' }}
          animate={{ offsetDistance: '100%' }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{
            offsetPath:
              'path("M 48 60 L 152 26 L 248 60 L 352 26 L 48 60")',
          }}
        />
      </svg>
      <p className="mt-4 text-center text-sm text-white/50">
        One loop, every second, entirely in your browser
      </p>
    </div>
  )
}
