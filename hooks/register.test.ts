import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BIG = Array.from({ length: 2000 }, (_, i) => `ok test_${i} passed`).join('\n')
const KEPT = 'FAILED test_42: expected 1, got 2\n[... 1999 lines omitted: passing tests ...]'

type Reply = { isAnswered: true; text: string; usage: Record<string, number> }

const answered = (text: string): Reply => ({
  isAnswered: true,
  text,
  usage: { input_tokens: 9000, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
})

// Each hook here stands for the engine beneath the mod.
const engine = (on: On, stdout: string, reply: unknown) => {
  const seen = { prompts: [] as string[], files: [] as string[], store: new Map<string, unknown>() }

  on('store.get', (_, e) => ({ value: seen.store.get((e as { key: string }).key) }))
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    seen.store.set(key, value)

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    seen.store.delete((e as { key: string }).key)

    return { value: undefined }
  })

  on('command.register', () => ({ value: { command: 'sieve' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('env.get', () => ({ value: '/tmp' }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('fs.write', (_, e) => {
    seen.files.push((e as { path: string }).path)

    return { value: undefined }
  })
  on('model.complete', (_, e) => {
    seen.prompts.push((e as { prompt: string }).prompt)

    return { value: reply } as never
  })
  on('tool.call', (_, e) =>
    e.tool === 'Read'
      ? {
          result: {
            type: 'text',
            file: { filePath: e.file_path, content: stdout, numLines: 2000, startLine: 1, totalLines: 2000 },
          },
        }
      : { result: { stdout, stderr: '', interrupted: false } },
  )

  return seen
}

test('a large Bash output is filtered and its original saved', async ($, on) => {
  const seen = engine(on, BIG, answered(KEPT))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'find the failing test', turnId: 't1' })
  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const stdout = (ran.result as { stdout: string }).stdout

  expect(stdout.includes('FAILED test_42')).toBe(true)
  expect(stdout.includes('context-sieve:')).toBe(true)
  expect(stdout.length < BIG.length / 10).toBe(true)
  expect(seen.prompts[0]?.includes('find the failing test')).toBe(true)
  expect(seen.files.length).toBe(1)
  expect(stdout.includes(seen.files[0] ?? 'no file')).toBe(true)
})

test('a small output never reaches the filter model', async ($, on) => {
  const seen = engine(on, 'hello', answered('x'))

  const ran = await $.tool.call({ tool: 'Bash', command: 'echo hello' })

  expect((ran.result as { stdout: string }).stdout).toBe('hello')
  expect(seen.prompts.length).toBe(0)
})

test('a failed filter leaves the output whole', async ($, on) => {
  engine(on, BIG, { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded' })

  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' })

  expect((ran.result as { stdout: string }).stdout).toBe(BIG)
})

test('KEEP_ALL and a reply that cuts too little leave the output whole', async ($, on) => {
  engine(on, BIG, answered('KEEP_ALL'))

  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' })

  expect((ran.result as { stdout: string }).stdout).toBe(BIG)
})

test('a higher threshold from the options is honoured', { options: { threshold: 1000000 } }, async ($, on) => {
  const seen = engine(on, BIG, answered(KEPT))

  const ran = await $.tool.call({ tool: 'Bash', command: 'npm test' })

  expect((ran.result as { stdout: string }).stdout).toBe(BIG)
  expect(seen.prompts.length).toBe(0)
})

const SIEVE = {
  command: 'sieve',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

test('/sieve reports net savings and keeps totals across sessions', async ($, on) => {
  const seen = engine(on, BIG, answered(KEPT))
  seen.store.set('totals', { filtered: 3, passed: 1, saved: 1000, spentIn: 500, spentOut: 10, old: 'x' })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const out = await $.command.run(SIEVE)
  const text = (out as { text: string }).text
  const all = seen.store.get('totals') as { filtered: number; saved: number; spentIn: number }

  expect(all.filtered).toBe(4)
  expect(all.spentIn).toBe(9500)
  expect(all.saved > 1000 + 8000).toBe(true)
  expect(text.includes('This session: 1 filtered')).toBe(true)
  expect(text.includes('All sessions: 4 filtered')).toBe(true)
  expect(text.includes('net ~')).toBe(true)
})

test('a failed filter call is counted as cost with nothing saved', async ($, on) => {
  const seen = engine(on, BIG, answered('KEEP_ALL'))

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.command.run(SIEVE)
  const all = seen.store.get('totals') as { passed: number; saved: number; spentIn: number }

  expect(all.passed).toBe(1)
  expect(all.saved).toBe(0)
  expect(all.spentIn).toBe(9000)
})

test('Read is left alone unless the option turns it on', async ($, on) => {
  const seen = engine(on, BIG, answered(KEPT))

  const ran = await $.tool.call({ tool: 'Read', file_path: '/big.log' })

  expect((ran.result as { file: { content: string } }).file.content).toBe(BIG)
  expect(seen.prompts.length).toBe(0)
})

const READ_ON = { options: { read: true, readThreshold: 20000 } }

test('a whole-file Read is filtered with line numbers when turned on', READ_ON, async ($, on) => {
  const seen = engine(on, BIG, answered('L43: ok test_42 passed\n[... 1999 lines omitted ...]'))

  const ran = await $.tool.call({ tool: 'Read', file_path: '/big.log' })
  const file = (ran.result as { file: { content: string; numLines: number } }).file

  expect(seen.prompts[0]?.includes('L1: ok test_0 passed')).toBe(true)
  expect(file.content.includes('L43: ok test_42 passed')).toBe(true)
  expect(file.content.includes('before editing')).toBe(true)
  expect(file.numLines).toBe(3)
  expect(seen.files.length).toBe(0)
})

test('a ranged Read is never filtered', READ_ON, async ($, on) => {
  const seen = engine(on, BIG, answered(KEPT))

  const ran = await $.tool.call({ tool: 'Read', file_path: '/big.log', offset: 1, limit: 2000 })

  expect((ran.result as { file: { content: string } }).file.content).toBe(BIG)
  expect(seen.prompts.length).toBe(0)
})
