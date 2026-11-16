export function calculateTargetScore(distance: number, shots: number, bullseye: boolean, moving: boolean) {
  // A distância aumenta o valor e cada tentativa reduz a recompensa do abate.
  const value = 1000 + Math.max(0, distance) * 2 + (bullseye ? 250 : 0) + (moving ? 150 : 0)
  return Math.max(1, Math.floor(value / Math.max(1, shots)))
}
