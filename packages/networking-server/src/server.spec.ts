import { ClientNetworkNode, ClientNetworkNodeModules, ClientNetworkNodeModulesFactory, ClientNetworkProtocols, listen, NetworkNodeConnection, NetworkNodeModule, NetworkNodeModuleConnection, NetworkNodeModulesFactory, PeerToPeerProtocols, Protocols, send, ServerNetworkProtocols } from '@code-essentials/networking'
import { ServerNetworkNode, ServerNetworkNodeModulesFactory } from './server.js'
import { getPort } from "@code-essentials/get-port"
import { readFile } from "node:fs/promises"
import test from "ava"
import { AsyncVariable } from '@code-essentials/utils'

const DelayConnectionInitializeModuleName = "delay"
type DelayConnectionInitializeModuleName = typeof DelayConnectionInitializeModuleName

class DelayConnectionInitializeModuleConnection<
        Protocols_ extends Protocols = Protocols,
    >
    implements NetworkNodeModuleConnection<Protocols_> {
    get module() {
        return <any>this.connection.self.modules[DelayConnectionInitializeModuleName]
    }

    constructor(
        readonly connection: NetworkNodeConnection<Protocols_>,
    ) { }

    async [Symbol.asyncDispose]() { }
}

interface DelayConnectionInitializeModuleSettings {
    delay: number
}

function DelayConnectionInitializeModulesFactory<Protocols_ extends Protocols = Protocols>(settings: DelayConnectionInitializeModuleSettings) {
    return {
        [DelayConnectionInitializeModuleName]: new DelayConnectionInitializeModule<Protocols_>(settings),
    }
}

DelayConnectionInitializeModulesFactory satisfies NetworkNodeModulesFactory<
    Protocols,
    NetworkNodeConnection,
    DelayConnectionInitializeModules,
    DelayConnectionInitializeModuleSettings,
    DelayConnectionInitializeModules
>

type DelayConnectionInitializeModules<Protocols_ extends Protocols = Protocols> = {
    [DelayConnectionInitializeModuleName]: DelayConnectionInitializeModule<Protocols_>
}

class DelayConnectionInitializeModule<Protocols_ extends Protocols = Protocols>
    implements NetworkNodeModule<
        Protocols_,
        NetworkNodeConnection<Protocols_>,
        DelayConnectionInitializeModules<Protocols_>,
        DelayConnectionInitializeModuleConnection<Protocols_>,
        DelayConnectionInitializeModuleSettings
    > {
    constructor(readonly settings: DelayConnectionInitializeModuleSettings) {}

    async connect(connection: NetworkNodeConnection<Protocols_>) {
        const moduleConnection = new DelayConnectionInitializeModuleConnection(connection)
        await AsyncVariable.wait(this.settings.delay)
        return <any>moduleConnection
    }

    async [Symbol.asyncDispose]() { }
}

test("server 1", async t => {
    type Protocols = PeerToPeerProtocols<{
        chat(msg: string): string
    }>

    await using port = await getPort()
    const cert = {
        cert: await readFile(".cert/cert.pem", { encoding: "utf-8" }),
        key: await readFile(".cert/key.pem", { encoding: "utf-8" }),
    } as const

    const modules = {
        server: () => ({
            ...ServerNetworkNodeModulesFactory(),
        }),
        client: () => ({
            ...ClientNetworkNodeModulesFactory(),
            // ...DelayConnectionInitializeModulesFactory({ delay: 2500 }),
        }),
    } as const

    await using server = new ServerNetworkNode<Protocols & ServerNetworkProtocols>(modules.server(), {
        httpOptions: {
            port: +port,
            cert,
            secret: "secret",
        },
        serverOptions: {
            transports: ["websocket", "polling"]
        }
    })
    await server.init()
    await server.start()

    await using client = new ClientNetworkNode<Protocols & ClientNetworkProtocols>(<ClientNetworkNodeModules<Protocols & ClientNetworkProtocols>>modules.client())
    await client.init()
    await client.connect(`https://localhost:${port}`, {
        rejectUnauthorized: false,
    })

    const clientToServer = client.connections[0]!
    const serverToClient = server.connections[0]!

    function reverse(msg: string) {
        return msg.split('').reverse().join('')
    }

    function lower(msg: string) {
        return msg.toLowerCase()
    }
    
    listen(serverToClient.socket, {
        chat(msg) {
            console.log(`server->client: ${msg}`)
            return reverse(msg)
        },
    })

    listen(clientToServer.socket, {
        chat(msg) {
            console.log(`client->server: ${msg}`)
            return lower(msg)
        },
    })

    const clientToServerMsg1 = "msg1"
    console.log(`sending client->server ${clientToServerMsg1}`)
    const clientToServerResponse1 = await send(clientToServer.socket, "chat", clientToServerMsg1)
    console.log(`received: "${clientToServerResponse1}" expected "${reverse(clientToServerMsg1)}"`)
    t.is(clientToServerResponse1, reverse(clientToServerMsg1))

    const serverToClientMsg1 = "MSG2"
    console.log(`sending server->client ${serverToClientMsg1}`)
    const serverToClientResponse1 = await send(serverToClient.socket, "chat", serverToClientMsg1)
    console.log(`received: "${serverToClientResponse1}" expected "${lower(serverToClientMsg1)}"`)
    t.is(serverToClientResponse1, lower(serverToClientMsg1))
})

test("connect with server module connection initialize delay", async t => {
    type Protocols = PeerToPeerProtocols<{
        chat(msg: string): string
    }>

    await using port = await getPort()
    const cert = {
        cert: await readFile(".cert/cert.pem", { encoding: "utf-8" }),
        key: await readFile(".cert/key.pem", { encoding: "utf-8" }),
    } as const

    const modules = {
        server: () => ({
            ...ServerNetworkNodeModulesFactory(),
            ...DelayConnectionInitializeModulesFactory({ delay: 2500 }),
        }),
        client: () => ({
            ...ClientNetworkNodeModulesFactory(),
            // ...DelayConnectionInitializeModulesFactory({ delay: 2500 }),
        }),
    } as const

    await using server = new ServerNetworkNode<Protocols & ServerNetworkProtocols>(modules.server(), {
        httpOptions: {
            port: +port,
            cert,
            secret: "secret",
        },
        serverOptions: {
            transports: ["websocket", "polling"]
        }
    })
    await server.init()
    await server.start()

    await using client = new ClientNetworkNode<Protocols & ClientNetworkProtocols>(<ClientNetworkNodeModules<Protocols & ClientNetworkProtocols>>modules.client())
    await client.init()
    await client.connect(`https://localhost:${port}`, {
        rejectUnauthorized: false,
    })

    const clientToServer = client.connections[0]!
    const serverToClient = server.connections[0]!

    function reverse(msg: string) {
        return msg.split('').reverse().join('')
    }

    function lower(msg: string) {
        return msg.toLowerCase()
    }
    
    listen(serverToClient.socket, {
        chat(msg) {
            console.log(`server->client: ${msg}`)
            return reverse(msg)
        },
    })

    listen(clientToServer.socket, {
        chat(msg) {
            console.log(`client->server: ${msg}`)
            return lower(msg)
        },
    })

    const clientToServerMsg1 = "msg1"
    console.log(`sending client->server ${clientToServerMsg1}`)
    const clientToServerResponse1 = await send(clientToServer.socket, "chat", clientToServerMsg1)
    console.log(`received: "${clientToServerResponse1}" expected "${reverse(clientToServerMsg1)}"`)
    t.is(clientToServerResponse1, reverse(clientToServerMsg1))

    const serverToClientMsg1 = "MSG2"
    console.log(`sending server->client ${serverToClientMsg1}`)
    const serverToClientResponse1 = await send(serverToClient.socket, "chat", serverToClientMsg1)
    console.log(`received: "${serverToClientResponse1}" expected "${lower(serverToClientMsg1)}"`)
    t.is(serverToClientResponse1, lower(serverToClientMsg1))
})

test("connect with client module connection initialize delay", async t => {
    type Protocols = PeerToPeerProtocols<{
        chat(msg: string): string
    }>

    await using port = await getPort()
    const cert = {
        cert: await readFile(".cert/cert.pem", { encoding: "utf-8" }),
        key: await readFile(".cert/key.pem", { encoding: "utf-8" }),
    } as const

    const modules = {
        server: () => ({
            ...ServerNetworkNodeModulesFactory(),
            // ...DelayConnectionInitializeModulesFactory({ delay: 2500 }),
        }),
        client: () => ({
            ...ClientNetworkNodeModulesFactory(),
            ...DelayConnectionInitializeModulesFactory<Protocols>({ delay: 2500 }),
        }),
    } as const

    await using server = new ServerNetworkNode<Protocols & ServerNetworkProtocols>(modules.server(), {
        httpOptions: {
            port: +port,
            cert,
            secret: "secret",
        },
        serverOptions: {
            transports: ["websocket", "polling"]
        }
    })
    await server.init()
    await server.start()

    await using client = new ClientNetworkNode<Protocols & ClientNetworkProtocols>(<ClientNetworkNodeModules<Protocols & ClientNetworkProtocols>><any>modules.client())
    await client.init()
    await client.connect(`https://localhost:${port}`, {
        rejectUnauthorized: false,
    })

    const clientToServer = client.connections[0]!
    const serverToClient = server.connections[0]!

    function reverse(msg: string) {
        return msg.split('').reverse().join('')
    }

    function lower(msg: string) {
        return msg.toLowerCase()
    }
    
    listen(serverToClient.socket, {
        chat(msg) {
            console.log(`server->client: ${msg}`)
            return reverse(msg)
        },
    })

    listen(clientToServer.socket, {
        chat(msg) {
            console.log(`client->server: ${msg}`)
            return lower(msg)
        },
    })

    const clientToServerMsg1 = "msg1"
    console.log(`sending client->server ${clientToServerMsg1}`)
    const clientToServerResponse1 = await send(clientToServer.socket, "chat", clientToServerMsg1)
    console.log(`received: "${clientToServerResponse1}" expected "${reverse(clientToServerMsg1)}"`)
    t.is(clientToServerResponse1, reverse(clientToServerMsg1))

    const serverToClientMsg1 = "MSG2"
    console.log(`sending server->client ${serverToClientMsg1}`)
    const serverToClientResponse1 = await send(serverToClient.socket, "chat", serverToClientMsg1)
    console.log(`received: "${serverToClientResponse1}" expected "${lower(serverToClientMsg1)}"`)
    t.is(serverToClientResponse1, lower(serverToClientMsg1))
})
