import { captureFirstStreamTokenUsage } from '@/features/chat/streamTokenUsage'

describe('captureFirstStreamTokenUsage', () => {
  it('keeps one authoritative usage when duplicate stream events arrive', () => {
    const initial = { input: 0, output: 0, total: 0, found: false }
    const providerUsage = { input: 4466, output: 264, total: 4730 }

    const first = captureFirstStreamTokenUsage(initial, providerUsage)
    const duplicate = captureFirstStreamTokenUsage(first, providerUsage)
    const thirdCopy = captureFirstStreamTokenUsage(duplicate, providerUsage)

    expect(thirdCopy).toEqual({
      input: 4466,
      output: 264,
      total: 4730,
      found: true,
    })
  })
})
