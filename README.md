# context-sieve

A Claude Code mod that keeps large tool outputs out of the main model's context.
When a tool result is longer than a threshold, a cheaper model (Haiku by default)
copies out, verbatim, only the lines the current task needs. The main model gets
that extract plus the path of a temp file holding the full output.

## What it filters

- `Bash` stdout, `Grep` content, `WebFetch` results
- text results of MCP (connector) tools
- `Read` only if you turn it on (experimental, see Options): whole-file reads of
  large text files are filtered with their line numbers kept; reads with
  `offset`/`limit` never are, so the exact text is there before an edit

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

- `/sieve` shows, for this session and for all sessions together, how many outputs
  were filtered, tokens saved, what the filter cost and the net
- `/sieve off` and `/sieve on` switch it for the session
- `/sieve reset` clears the all-sessions totals

The net figure counts each saved token once, in main-model input tokens, and
prices the filter at `priceRatio` of the main model. Saved tokens would also be
re-read on later turns, so the real saving is higher.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `threshold` | 20000 | Outputs longer than this many characters are filtered (about 4 characters per token) |
| `model` | `haiku` | Model alias or id that filters |
| `mcp` | true | Also filter MCP tool results |
| `read` | false | Experimental: also filter whole-file `Read` of large text files |
| `readThreshold` | 40000 | Threshold in characters for those reads |
| `priceRatio` | 0.2 | Filter model's price as a share of the main model's, for the net figure |

Change them with `/plugin configure context-sieve@context-sieve`.

## Develop

```
claude plugin validate .
claude plugin test .
```
