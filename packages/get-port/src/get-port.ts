import { existsSync } from "fs"
import { mkdir, unlink, writeFile } from "fs/promises"
import { default as getPort_, Options } from "get-port"
import { dirname } from "path"
import { lock, LockOptions } from "proper-lockfile"
import { AsyncVariable } from "@code-essentials/utils"

export const lockOptionsDefault: LockOptions = {
    lockfilePath: "./.lock/port_$PORT.lock",
    stale: 5000,
    retries: 3,
}

export interface Port extends AsyncDisposable {
    port: number
}

export interface GetPortOptions {
    port: Options
    lock: LockOptions
}

export async function getPort(options?: GetPortOptions): Promise<Port> {
    const lock_ = {
        ...lockOptionsDefault,
        ...options?.lock
    }

    const { lockfilePath } = lock_
    const lock__ = {
        ...lock_,
        lockfilePath: undefined
    }

    while (true) {
        const port = await getPort_(...(options?.port ? [options.port] : []))
        const path = lockfilePath!.replace("$PORT", `${port}`)

        const dir = dirname(path)
        if (!existsSync(dir))
            await mkdir(dir, { recursive: true })

        if (!existsSync(path))
            await writeFile(path, "")

        try {
            const release = await lock(path, lock__)

            return {
                port,
                async [Symbol.asyncDispose]() {
                    await release()
                    await unlink(path)
                }
            }
        }
        catch (e) {
            if (e && typeof e === 'object' && (<any>e)['code'] === 'ELOCKED')
                await AsyncVariable.wait(Math.random() * 100 + 100)
            else
                throw e
        }
    }
}
