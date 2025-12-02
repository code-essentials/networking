#!/usr/bin/env node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

async function main() {
  try {
    const isPiped = process.stdin && !process.stdin.isTTY

    // If a file was passed as an unlabeled argument, use it directly
    const fileArg = process.argv.slice(2).find(a => !a.startsWith('--')) || null
    if (fileArg) {
      // If SKIP_SPAWN is set, print the path and exit (for tests)
      if (process.env.SKIP_SPAWN) {
        console.log(fileArg)
        process.exit(0)
      }
      const electronBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
      const cmd = fs.existsSync(electronBin) ? electronBin : (process.platform === 'win32' ? 'electron' : 'electron')
      const args = ['.', `--stdin-file=${fileArg}`]
      const proc = spawn(cmd, args, { stdio: 'inherit' })
      proc.on('exit', (code) => process.exit(code))
      return
    }

    if (!isPiped) {
      // No piped stdin and no file arg: just launch electron normally
      const proc = spawn(path.join(__dirname, '..', 'node_modules', '.bin', 'electron'), ['.'], { stdio: 'inherit' })
      proc.on('exit', (code) => process.exit(code))
      return
    }

    // Piped stdin: write to a temp file and pass path to electron
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'networking-debug-'))
    const outPath = path.join(tmpDir, 'stdin.log')
    const out = fs.createWriteStream(outPath)
    process.stdin.pipe(out)
    out.on('finish', () => {
      if (process.env.SKIP_SPAWN) {
        // For tests: print path and exit
        console.log(outPath)
        process.exit(0)
      }
      // Try to find electron binary: prefer local node_modules/.bin, then pnpm exec, then fallback to 'electron'
      const localBin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
      let cmd, args
      if (fs.existsSync(localBin)) {
        cmd = localBin
        args = ['.', `--stdin-file=${outPath}`]
      } else {
        // prefer pnpm exec to locate the correct electron in workspace
        try {
          const spawnSync = require('child_process').spawnSync
          const check = spawnSync('pnpm', ['--version'])
          if (check.status === 0) {
            cmd = 'pnpm'
            args = ['exec', '--', 'electron', '.', `--stdin-file=${outPath}`]
          } else {
            cmd = 'electron'
            args = ['.', `--stdin-file=${outPath}`]
          }
        } catch (_) {
          cmd = 'electron'
          args = ['.', `--stdin-file=${outPath}`]
        }
      }
      const proc = spawn(cmd, args, { stdio: 'inherit' })
      proc.on('exit', (code) => process.exit(code))
    })
    out.on('error', (err) => {
      console.error('Failed to write temp stdin file', err)
      process.exit(2)
    })
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}

main()
