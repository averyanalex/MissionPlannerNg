import { useMemo } from "react";

type TapeGaugeProps = {
  value: number | undefined;
  orientation: "vertical" | "horizontal";
  visibleRange: number;
  majorTickInterval: number;
  minorTicksPerMajor: number;
  size: { width: number; height: number };
  unit?: string;
  label?: string;
  bugValue?: number;
  trendValue?: number;
  circular?: boolean;
  circularRange?: number;
  /** If true, tape grows upward (speed/altitude). If false, tape grows downward. Default true for vertical. */
  growsUp?: boolean;
  /** Terrain MSL altitude — draws a green band from terrain level downward on vertical tapes */
  terrainValue?: number;
};

const ACCENT = "#12b9ff";
const BG = "#0a0f14";

const HEADING_LABELS: Record<number, string> = {
  0: "N", 90: "E", 180: "S", 270: "W",
};

export function TapeGauge({
  value,
  orientation,
  visibleRange,
  majorTickInterval,
  minorTicksPerMajor,
  size,
  unit,
  label,
  bugValue,
  trendValue,
  circular = false,
  circularRange = 360,
  growsUp = true,
  terrainValue,
}: TapeGaugeProps) {
  const isVertical = orientation === "vertical";
  const { width, height } = size;
  const displayValue = value ?? 0;
  const hasValue = value !== undefined && !Number.isNaN(value);

  // Quantize to nearest integer to avoid recalculating ticks on sub-pixel jitter
  const quantized = Math.round(displayValue);

  const ticks = useMemo(() => {
    const result: Array<{
      pos: number;
      isMajor: boolean;
      labelText: string | null;
    }> = [];

    const minorInterval = majorTickInterval / minorTicksPerMajor;
    const halfRange = visibleRange / 2;
    const start = quantized - halfRange - majorTickInterval;
    const end = quantized + halfRange + majorTickInterval;

    const firstTick = Math.floor(start / minorInterval) * minorInterval;

    for (let val = firstTick; val <= end; val += minorInterval) {
      let displayVal = val;
      if (circular) {
        displayVal = ((val % circularRange) + circularRange) % circularRange;
      }

      const offset = val - quantized;
      const span = isVertical ? height : width;
      const pxPerUnit = span / visibleRange;
      const pos = span / 2 + (growsUp && isVertical ? -1 : 1) * offset * pxPerUnit;

      if (pos < -20 || pos > span + 20) continue;

      const isMajor = Math.abs(val - Math.round(val / majorTickInterval) * majorTickInterval) < minorInterval * 0.1;

      let labelText: string | null = null;
      if (isMajor) {
        const rounded = Math.round(displayVal);
        if (circular && HEADING_LABELS[rounded] !== undefined) {
          labelText = HEADING_LABELS[rounded];
        } else {
          labelText = String(rounded);
        }
      }

      result.push({ pos, isMajor, labelText });
    }

    return result;
  }, [quantized, visibleRange, majorTickInterval, minorTicksPerMajor, isVertical, width, height, circular, circularRange, growsUp]);

  // Sub-pixel fractional offset for smooth scrolling
  const frac = displayValue - quantized;
  const span = isVertical ? height : width;
  const pxPerUnit = span / visibleRange;
  const fracPx = (growsUp && isVertical ? 1 : -1) * frac * pxPerUnit;

  // Bug position (e.g., airspeed bug, nav bearing)
  const bugPos = useMemo(() => {
    if (bugValue === undefined || !hasValue) return null;
    let offset = bugValue - displayValue;
    if (circular) {
      // Wrap to shortest angular path
      offset = ((offset % circularRange) + circularRange + circularRange / 2) % circularRange - circularRange / 2;
    }
    const pos = span / 2 + (growsUp && isVertical ? -1 : 1) * offset * pxPerUnit;
    if (pos < 0 || pos > span) return null;
    return pos;
  }, [bugValue, displayValue, span, pxPerUnit, isVertical, growsUp, hasValue, circular, circularRange]);

  // Terrain band position (vertical tapes only)
  const terrainPos = useMemo(() => {
    if (terrainValue === undefined || !hasValue || !isVertical) return null;
    const offset = terrainValue - displayValue;
    return span / 2 + (growsUp ? -1 : 1) * offset * pxPerUnit;
  }, [terrainValue, displayValue, span, pxPerUnit, isVertical, growsUp, hasValue]);

  // Trend arrow (e.g., climb rate)
  const trendLen = useMemo(() => {
    if (trendValue === undefined || !hasValue) return null;
    const maxLen = span * 0.3;
    const len = Math.max(-maxLen, Math.min(maxLen, trendValue * pxPerUnit * 6));
    if (Math.abs(len) < 3) return null;
    return len;
  }, [trendValue, hasValue, span, pxPerUnit]);

  // Readout box dimensions
  const readoutW = isVertical ? width * 0.7 : 52;
  const readoutH = isVertical ? 24 : height * 0.6;
  const cx = width / 2;
  const cy = height / 2;

  const formatValue = (v: number) => {
    if (circular) return String(Math.round(((v % circularRange) + circularRange) % circularRange));
    return Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(Math.abs(v) < 10 ? 1 : 0);
  };

  return (
    <div
      className={isVertical ? "tape-mask-vertical" : "tape-mask-horizontal"}
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        className="hud-glow-soft"
        style={{ overflow: "hidden" }}
      >
        {/* Label at top */}
        {label && (
          <text
            x={cx}
            y={8}
            textAnchor="middle"
            fontSize={9}
            fontWeight={600}
            className="hud-svg-text"
            opacity={0.6}
          >
            {label}
          </text>
        )}

        {/* Tick group with fractional scroll */}
        <g transform={isVertical ? `translate(0, ${fracPx})` : `translate(${fracPx}, 0)`}>
          {ticks.map((tick, i) => {
            if (isVertical) {
              const tickLen = tick.isMajor ? 12 : 6;
              const x1 = width - tickLen;
              return (
                <g key={i}>
                  <line
                    x1={x1} y1={tick.pos} x2={width} y2={tick.pos}
                    className="hud-svg-line"
                    strokeWidth={tick.isMajor ? 2 : 1}
                    opacity={tick.isMajor ? 0.9 : 0.4}
                  />
                  {tick.labelText && (
                    <text
                      x={x1 - 4}
                      y={tick.pos}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={10}
                      className="hud-svg-text"
                      opacity={0.7}
                    >
                      {tick.labelText}
                    </text>
                  )}
                </g>
              );
            } else {
              const tickLen = tick.isMajor ? 12 : 6;
              return (
                <g key={i}>
                  <line
                    x1={tick.pos} y1={0} x2={tick.pos} y2={tickLen}
                    className="hud-svg-line"
                    strokeWidth={tick.isMajor ? 2 : 1}
                    opacity={tick.isMajor ? 0.9 : 0.4}
                  />
                  {tick.labelText && (
                    <text
                      x={tick.pos}
                      y={tickLen + 12}
                      textAnchor="middle"
                      fontSize={10}
                      className="hud-svg-text"
                      opacity={0.7}
                    >
                      {tick.labelText}
                    </text>
                  )}
                </g>
              );
            }
          })}
        </g>

        {/* Terrain band — green shaded region below terrain level */}
        {terrainPos !== null && (
          <>
            <rect
              x={0}
              y={terrainPos}
              width={width}
              height={Math.max(0, span - terrainPos + span)}
              fill="rgba(34, 139, 34, 0.12)"
            />
            <line
              x1={0}
              y1={terrainPos}
              x2={width}
              y2={terrainPos}
              stroke="#57e38b"
              strokeWidth={1.5}
              opacity={0.6}
              strokeDasharray="4 3"
            />
          </>
        )}

        {/* Bug indicator — vertical tape */}
        {bugPos !== null && isVertical && (
          <polygon
            points={`${width},${bugPos - 4} ${width - 6},${bugPos} ${width},${bugPos + 4}`}
            fill="#57e38b"
            opacity={0.8}
          />
        )}

        {/* Bug indicator — horizontal tape (e.g., nav bearing on heading) */}
        {bugPos !== null && !isVertical && (
          <polygon
            points={`${bugPos},0 ${bugPos - 4},6 ${bugPos + 4},6`}
            fill="#57e38b"
            opacity={0.8}
          />
        )}

        {/* Trend arrow */}
        {trendLen !== null && isVertical && (
          <line
            x1={cx + readoutW / 2 + 4}
            y1={cy}
            x2={cx + readoutW / 2 + 4}
            y2={cy - trendLen}
            stroke={trendLen > 0 ? "#57e38b" : "#ff4444"}
            strokeWidth={2.5}
            markerEnd="none"
            opacity={0.8}
          />
        )}

        {/* Center readout box */}
        {isVertical ? (
          <>
            {/* Pointer triangle */}
            <polygon
              points={`${width},${cy} ${width - 8},${cy - 5} ${width - 8},${cy + 5}`}
              fill={ACCENT}
            />
            <rect
              x={cx - readoutW / 2}
              y={cy - readoutH / 2}
              width={readoutW}
              height={readoutH}
              rx={3}
              fill={BG}
              stroke={ACCENT}
              strokeWidth={2}
            />
          </>
        ) : (
          <>
            {/* Down pointer triangle */}
            <polygon
              points={`${cx},${0} ${cx - 5},${8} ${cx + 5},${8}`}
              fill={ACCENT}
            />
            <rect
              x={cx - readoutW / 2}
              y={cy - readoutH / 2 + 4}
              width={readoutW}
              height={readoutH}
              rx={3}
              fill={BG}
              stroke={ACCENT}
              strokeWidth={2}
            />
          </>
        )}

        {/* Value text */}
        <text
          x={cx}
          y={isVertical ? cy : cy + 4}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={14}
          fontWeight={700}
          className="hud-svg-text"
        >
          {hasValue ? formatValue(displayValue) : "--"}
        </text>

        {/* Unit label */}
        {unit && isVertical && (
          <text
            x={cx}
            y={cy + readoutH / 2 + 12}
            textAnchor="middle"
            fontSize={8}
            className="hud-svg-text"
            opacity={0.5}
          >
            {unit}
          </text>
        )}
      </svg>
    </div>
  );
}
