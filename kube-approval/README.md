# kube-approval

Approval gate for [pi](https://github.com/earendil-works/pi-mono) bash tool calls
that invoke `oc`, `kubectl`, or `aws`.

Read-only invocations (get/describe/logs, `aws describe-*`/`list-*`, etc.) run
without interruption. Anything else — mutating verbs, unrecognized global
flags, embedded shell (`sh -c`, command substitution, `xargs`, `find -exec`)
— requires the agent to state a short justification and then asks the user to
approve once, for matching commands this session, for all guarded commands
this session, or to deny.

## Prerequisites

- Node.js 18 or newer
- Pi 0.82.1 or newer

## Install

Try the current checkout for one Pi invocation without changing settings:

```bash
pi -e /path/to/pi-experiments/kube-approval
```

Or add it as a package in `~/.pi/agent/settings.json`:

```json
{
  "packages": ["/path/to/pi-experiments/kube-approval"]
}
```

## Commands

### `/approval-gates`

Show the current read-only allowlist policy for kubectl/oc/aws.

### `/approval-gates-reset`

Clear all temporary approval-gate bypasses granted during this session
(both per-command-pattern approvals and the "allow all" bypass).

## How it works

- Parses the bash command with a small shell tokenizer (handles quoting,
  `&&`/`||`/`;`/`|`, `sudo`/`env`/`time`/`nice`/`timeout` wrappers, `sh -c`
  strings, `$(...)` substitutions, `xargs`, and `find -exec`).
- Classifies each guarded invocation as read-only or not, based on an
  allowlist of verbs/operations per binary.
- Injects a system-prompt rule requiring the agent to justify non-read-only
  guarded commands in its own message before the tool call.
- Blocks the tool call with a reason if no justification was found, if no UI
  is available to ask for approval, or if the user denies the request.
- Remembers approvals in memory only — bypasses are cleared when Pi exits or
  when `/approval-gates-reset` is run.
