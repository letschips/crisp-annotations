export interface SpiralPoint {
  x: number;
  y: number;
}

interface SpiralPathOptions {
  amplitude: number;
  samples?: number;
  turns: number;
}

function format(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function point(value: SpiralPoint): string {
  return `${format(value.x)} ${format(value.y)}`;
}

export function buildCoiledSpiralPath(
  from: SpiralPoint,
  to: SpiralPoint,
  options: SpiralPathOptions,
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const unit = { x: dx / length, y: dy / length };
  const normal = { x: -unit.y, y: unit.x };
  const turns = Math.max(0.8, options.turns);
  const amplitude = Math.max(1, options.amplitude);
  const alongRadius = Math.min(
    length * 0.12,
    (length / turns) * 0.38,
  );
  const samples = Math.max(
    48,
    options.samples ?? Math.ceil(turns * 24),
  );
  const points: SpiralPoint[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const angle = progress * turns * Math.PI * 2;
    const envelope = Math.sin(progress * Math.PI);
    const growth = 0.38 + progress * 0.62;
    const radius = envelope * growth;
    const along = length * progress + Math.sin(angle) * alongRadius * radius;
    const across = Math.cos(angle) * amplitude * radius;
    points.push({
      x: from.x + unit.x * along + normal.x * across,
      y: from.y + unit.y * along + normal.y * across,
    });
  }

  let path = `M${point(points[0])}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midpoint = {
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    };
    path += ` Q${point(current)} ${point(midpoint)}`;
  }
  path += ` L${point(points[points.length - 1])}`;
  return path;
}
