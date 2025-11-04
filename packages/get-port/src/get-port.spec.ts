import test from "ava"
import { getPort } from "./get-port.js"
import { createServer } from 'http'
import { AsyncVariable } from "@code-essentials/utils"

const n = 2
const parallel = 5

for (let i = 0; i < n; i++) {
    test(`getPort ${i} x${parallel}`, async t => {
        const completed = new AsyncVariable<void>()

        async function server() {
            await using port = await getPort()
            const server = createServer().listen(port.port)
            await completed
            server.close()
        }

        const servers = new Array(parallel).fill(undefined).map(_ => server())

        await AsyncVariable.wait(2500)
        completed.set()

        await Promise.all(servers)

        t.pass()
    })
}

test('valueOf', async t => {
    await using port = await getPort()

    t.is(+port, port.port)
})

test('toString', async t => {
    await using port = await getPort()

    t.is(`${port}`, port.port.toString())
})
