# context-sieve

A Claude Code mod that keeps large tool outputs out of the main model's context.
When a tool result is longer than a threshold, a cheaper model (Haiku by default)
copies out, verbatim, only the lines the current task needs. The main model gets
that extract plus the path of a temp file holding the full output.

## What it filters

- `Bash` stdout, `Grep` content, `WebFetch` results
- text results of MCP (connector) tools
- not `Read`: file edits need the exact text

If the filter fails, says everything matters, or would cut less than 30%, the
output passes through unchanged.

## Install

At the prompt of a terminal session:

```
/plugin install context-sieve --marketplace Kielczynski/context-sieve
```

From a shell:

```
claude plugin install context-sieve --marketplace Kielczynski/context-sieve
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace
with `Kielczynski/context-sieve`, then Add plugin.

The repository is private: the machine needs a git credential for github.com
(an SSH key, or `gh auth login` then `gh auth setup-git`).

## Use

- `/sieve` shows how many outputs were filtered, tokens saved and tokens the filter used
- `/sieve off` and `/sieve on` switch it for the session

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `threshold` | 20000 | Outputs longer than this many characters are filtered (about 4 characters per token) |
| `model` | `haiku` | Model alias or id that filters |
| `mcp` | true | Also filter MCP tool results |

## Develop

```
claude plugin validate .
claude plugin test .
```
