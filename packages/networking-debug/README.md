# networking-debug

Simple Electron app that reads piped Socket.IO debug output from stdin, parses events and ACKs, and displays a time-aligned log.

How to run:

1. Install deps (from repository root or package folder):

```bash
cd packages/networking-debug
pnpm install
pnpm start
```

2. Pipe a debug log into the app:

```bash
cat /path/to/debug.log | pnpm start
```

3. For quick parser-only test (no Electron):

```bash
cat /path/to/debug.log | node src/parser.js
```

## CLI

The package provides a small CLI executable `networking-debug` (also available via `pnpm start` in the package) with these usage forms:

- Pipe stdin into the app (recommended for quick debugging):

```bash
cat /path/to/debug.log | networking-debug
# or via package script:
cat /path/to/debug.log | pnpm start
```

- Open a file directly with an unlabeled argument:

```bash
networking-debug /path/to/debug.log
```

- Developer/testing option: SKIP_SPAWN

If you want to inspect the temporary file the CLI creates (when piping), set `SKIP_SPAWN=1` and the command will print the temp path and exit instead of launching Electron:

```bash
cat /path/to/debug.log | SKIP_SPAWN=1 networking-debug
# prints something like /tmp/networking-debug-XXXX/stdin.log
```

- Internal option used when Electron is launched by the wrapper:

```
--stdin-file=/path/to/file
```

The Electron main process will consume `--stdin-file` and feed its lines into the parser. This is an internal detail normally handled by the CLI wrapper.

