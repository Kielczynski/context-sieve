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
  const seen = { prompts: [] as string[], files: [] as string[] }

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
  on('tool.call', () => ({ result: { stdout, stderr: '', interrupted: false } }))

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
