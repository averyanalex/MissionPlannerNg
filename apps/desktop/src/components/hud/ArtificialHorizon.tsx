import { useMemo } from "react";

type ArtificialHorizonProps = {
  pitch: number | undefined;
  roll: number | undefined;
  size: { width: number; height: number };
};

const ACCENT = "#12b9ff";
const PX_PER_DEG = 4;
const PITCH_CLAMP = 40;

const ROLL_TICKS = [
  { deg: -60, len: 12 },
  { deg: -45, len: 8 },
  { deg: -30, len: 12 },
  { deg: -20, len: 8 },
  { deg: -10, len: 8 },
  { deg: 0, len: 14 },
  { deg: 10, len: 8 },
  { deg: 20, len: 8 },
  { deg: 30, len: 12 },
  { deg: 45, len: 8 },
  { deg: 60, len: 12 },
];

export function ArtificialHorizon({ pitch, roll, size }: ArtificialHorizonProps) {
  const { width, height } = size;
  const cx = width / 2;
  const cy = height / 2;
  const hasPitch = pitch !== undefined && !Number.isNaN(pitch);
  const hasRoll = roll !== undefined && !Number.isNaN(roll);

  const pitchVal = hasPitch ? Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, pitch)) : 0;
  const rollVal = hasRoll ? roll : 0;

  // Static pitch ladder lines — only the transform changes per frame
  const pitchLines = useMemo(() => {
    const lines: Array<{
      deg: number;
      y: number;
      halfWidth: number;
      isDashed: boolean;
      showLabel: boolean;
    }> = [];

    for (let deg = -PITCH_CLAMP; deg <= PITCH_CLAMP; deg += 5) {
      if (deg === 0) continue;
      const y = -deg * PX_PER_DEG;
      const showLabel = deg % 10 === 0;
      const halfWidth = showLabel ? 60 : 30;
      const isDashed = deg < 0;
      lines.push({ deg, y, halfWidth, isDashed, showLabel });
    }

    return lines;
  }, []);

  // Roll arc radius
  const rollRadius = Math.min(cx, cy) - 24;

  return (
    <svg
      width={width}
      height={height}
      className="hud-glow-soft"
      style={{ overflow: "hidden" }}
    >
      <defs>
        <clipPath id="horizon-clip">
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>

      {/* Pitch ladder + horizon, rotated and translated */}
      <g clipPath="url(#horizon-clip)">
        <g transform={`translate(${cx}, ${cy}) rotate(${-rollVal})`}>
          {/* Horizon line — extends well beyond viewport for rotation */}
          <line
            x1={-width}
            y1={pitchVal * PX_PER_DEG}
            x2={width}
            y2={pitchVal * PX_PER_DEG}
            stroke={ACCENT}
            strokeWidth={2.5}
            opacity={0.8}
          />

          {/* Pitch ladder */}
          <g transform={`translate(0, ${pitchVal * PX_PER_DEG})`}>
            {pitchLines.map((line) => (
              <g key={line.deg}>
                <line
                  x1={-line.halfWidth}
                  y1={line.y}
                  x2={line.halfWidth}
                  y2={line.y}
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  strokeDasharray={line.isDashed ? "6 4" : undefined}
                  opacity={0.6}
                />
                {line.showLabel && (
                  <>
                    <text
                      x={-line.halfWidth - 6}
                      y={line.y}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={10}
                      className="hud-svg-text"
                      opacity={0.6}
                    >
                      {line.deg}
                    </text>
                    <text
                      x={line.halfWidth + 6}
                      y={line.y}
                      textAnchor="start"
                      dominantBaseline="central"
                      fontSize={10}
                      className="hud-svg-text"
                      opacity={0.6}
                    >
                      {line.deg}
                    </text>
                  </>
                )}
              </g>
            ))}
          </g>
        </g>
      </g>

      {/* Roll arc (fixed to frame) */}
      <g transform={`translate(${cx}, ${cy})`}>
        {/* Arc */}
        <path
          d={describeArc(0, 0, rollRadius, -60, 60)}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Roll ticks */}
        {ROLL_TICKS.map((tick) => {
          const rad = ((tick.deg - 90) * Math.PI) / 180;
          const x1 = Math.cos(rad) * rollRadius;
          const y1 = Math.sin(rad) * rollRadius;
          const x2 = Math.cos(rad) * (rollRadius - tick.len);
          const y2 = Math.sin(rad) * (rollRadius - tick.len);
          return (
            <line
              key={tick.deg}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={ACCENT}
              strokeWidth={tick.deg === 0 ? 2.5 : 1.5}
              opacity={0.7}
            />
          );
        })}

        {/* Roll pointer (moves with roll) */}
        <g transform={`rotate(${-rollVal})`}>
          <polygon
            points={`0,${-rollRadius + 2} -5,${-rollRadius + 10} 5,${-rollRadius + 10}`}
            fill={ACCENT}
            opacity={0.9}
          />
        </g>

        {/* Fixed top triangle reference (zenith marker) */}
        <polygon
          points={`0,${-rollRadius - 2} -5,${-rollRadius - 10} 5,${-rollRadius - 10}`}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.5}
          opacity={0.6}
        />
      </g>

      {/* Aircraft reference symbol (fixed W-shape at center) */}
      <g transform={`translate(${cx}, ${cy})`} stroke={ACCENT} strokeWidth={2.5} fill="none">
        {/* Left wing */}
        <line x1={-40} y1={0} x2={-12} y2={0} />
        <line x1={-12} y1={0} x2={-12} y2={6} />
        {/* Right wing */}
        <line x1={12} y1={0} x2={40} y2={0} />
        <line x1={12} y1={0} x2={12} y2={6} />
        {/* Center dot */}
        <circle cx={0} cy={0} r={3} fill={ACCENT} />
      </g>

      {/* Pitch and roll text readouts */}
      <text
        x={cx - 50}
        y={height - 6}
        textAnchor="middle"
        fontSize={10}
        className="hud-svg-text"
        opacity={0.5}
      >
        P {hasPitch ? pitch.toFixed(1) : "--"}°
      </text>
      <text
        x={cx + 50}
        y={height - 6}
        textAnchor="middle"
        fontSize={10}
        className="hud-svg-text"
        opacity={0.5}
      >
        R {hasRoll ? roll.toFixed(1) : "--"}°
      </text>
    </svg>
  );
}

/** SVG arc path description */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = ((startAngle - 90) * Math.PI) / 180;
  const endRad = ((endAngle - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}
