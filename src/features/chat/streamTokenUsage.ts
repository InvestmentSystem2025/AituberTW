export type StreamTokenUsage = {
  input: number
  output: number
  total: number
  found: boolean
}

export function captureFirstStreamTokenUsage(
  current: StreamTokenUsage,
  next: { input: number; output: number; total: number } | null
): StreamTokenUsage {
  if (!next || current.found) return current

  return {
    input: Math.max(0, Math.floor(next.input)),
    output: Math.max(0, Math.floor(next.output)),
    total: Math.max(0, Math.floor(next.total)),
    found: true,
  }
}
