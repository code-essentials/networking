import { HalfProtocolsToEvents, ServerNetworkProtocols, NetworkNode, NetworkNodeConnection, Protocols, SocketWith, parser, NetworkReadyProtocol, send, NetworkNodeModulesFactory, type ListenProtocols, type SendProtocols } from '@code-essentials/networking'
import * as server from 'socket.io'
import * as https from 'node:https'
import * as http from 'node:http'
import { Http3Server } from '@fails-components/webtransport'
import { AsyncVariable } from '@code-essentials/utils'

export type ServerSideEvents = server.DefaultEventsMap

export type ServerWith<
    NetworkProtocols extends Protocols,
    SocketInfo = unknown,
> =
    server.Server<
        HalfProtocolsToEvents<ListenProtocols<NetworkProtocols>>,
        HalfProtocolsToEvents<SendProtocols<NetworkProtocols>>,
        ServerSideEvents,
        SocketInfo
    >

export type ServerSocketWith<
    NetworkProtocols extends Protocols,
    SocketInfo = unknown,
> =
    server.Socket<
        HalfProtocolsToEvents<ListenProtocols<NetworkProtocols>>,
        HalfProtocolsToEvents<SendProtocols<NetworkProtocols>>,
        ServerSideEvents,
        SocketInfo
    >

export interface ServerSettings {
    serverOptions: Partial<server.ServerOptions>
    httpOptions: {
        cert?: {
            key: string
            cert: string
        }
        secret?: string
        port: number
    }
}

export type ServerNetworkNodeModules<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _NetworkProtocols extends ServerNetworkProtocols = ServerNetworkProtocols
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
> = {}

export function ServerNetworkNodeModulesFactory<
    NetworkProtocols extends ServerNetworkProtocols = ServerNetworkProtocols
>(): ServerNetworkNodeModules<NetworkProtocols> {
    return {
    }
}

ServerNetworkNodeModulesFactory satisfies NetworkNodeModulesFactory<
    Protocols,
    ServerToClientNetworkNodeConnection,
    ServerNetworkNodeModules,
    void,
    ServerNetworkNodeModules
>

export class ServerNetworkNode<
    NetworkProtocols extends ServerNetworkProtocols = ServerNetworkProtocols,
    Modules extends ServerNetworkNodeModules = ServerNetworkNodeModules,
    SocketInfo = unknown,
>
    extends NetworkNode<
        NetworkProtocols,
        ServerToClientNetworkNodeConnection<NetworkProtocols, Modules, SocketInfo>,
        Modules
    > {
    readonly #io: server.Server<
        HalfProtocolsToEvents<ListenProtocols<NetworkProtocols>>,
        HalfProtocolsToEvents<SendProtocols<NetworkProtocols>>,
        ServerSideEvents,
        SocketInfo
    >

    readonly #httpsServer?: https.Server
    readonly #httpServer?: http.Server
    readonly #http3Server?: Http3Server
    readonly settings: ServerSettings

    get server() {
        return this.#io
    }

    static #defaults: ServerSettings = {
        serverOptions: {
            transports: ['websocket', 'webtransport', 'polling'],
            parser: <unknown>parser,
        },
        httpOptions: {
            port: 3001,
        },
    }

    constructor(
        modules: Modules,
        settings?: Partial<ServerSettings>
    ) {
        super(modules)

        this.settings = {
            httpOptions: {
                ...ServerNetworkNode.#defaults.httpOptions,
                ...settings?.httpOptions,
            },
            serverOptions: {
                ...ServerNetworkNode.#defaults.serverOptions,
                ...settings?.serverOptions,
            },
        }

        if (this.settings.httpOptions.cert) {
            this.#httpsServer = https.createServer({
                cert: this.settings.httpOptions.cert.cert,
                key: this.settings.httpOptions.cert.key,
            })
        }
        else {
            this.#httpServer = http.createServer()
        }

        this.#io = new server.Server(
            this.settings.httpOptions.cert ?
                this.#httpsServer :
                this.#httpServer,
            this.settings.serverOptions
        )

        this.#io.on("connection", async socket => {
            // console.log(`new connection: ${socket.conn.transport.name} ${socket.client.request.url} ${JSON.stringify(socket.handshake.auth)}`)
            const connection = new ServerToClientNetworkNodeConnection<NetworkProtocols, Modules, SocketInfo>(this, socket)
            this.connections.push(connection)
            await connection.initialize()

            const response = await send<ServerNetworkProtocols>(connection.socket, NetworkReadyProtocol)
            if (response !== NetworkReadyProtocol)
                throw new Error(`${NetworkReadyProtocol} not acknowledged on client side`)
        })

        if (this.settings.serverOptions.transports?.includes("webtransport") ?? false) {
            if (!this.settings.httpOptions.cert)
                throw new Error("must supply httpOptions.cert in webtransport")
            if (this.settings.httpOptions.secret === undefined)
                throw new Error("must supply httpOptions.secret in webtransport")

            this.#http3Server = new Http3Server({
                port: this.settings.httpOptions.port,
                host: "0.0.0.0",
                secret: this.settings.httpOptions.secret,
                cert: this.settings.httpOptions.cert.cert,
                privKey: this.settings.httpOptions.cert.key,
            })
        }
    }

    async start() {
        const http_listening = new AsyncVariable<void>()
        this.#httpsServer?.listen(this.settings.httpOptions.port, () => http_listening.set())
        this.#httpServer?.listen(this.settings.httpOptions.port, () => http_listening.set())
        await http_listening

        if (this.#http3Server) {
            this.#http3Server.startServer()
            void this.#http3()
        }
    }

    async stop() {
        this.#io.disconnectSockets(true)
        await AsyncVariable.callback(async cb => await this.#io.close(cb))

        this.#http3Server?.stopServer()
    }

    override async [Symbol.asyncDispose]() {
        await super[Symbol.asyncDispose]()
        await this.stop()
    }

    async #http3() {
        const session = this.#http3Server!.sessionStream(this.settings.serverOptions.path ?? "/")
        const reader = session.getReader()

        while (true) {
            const { value, done } = <ReadableStreamReadResult<unknown>>await reader.read()
            if (done)
                break

            await this.#io.engine.onWebTransportSession(value)
        }
    }
}

class ServerToClientNetworkNodeConnection<
    Protocols_ extends ServerNetworkProtocols = ServerNetworkProtocols,
    Modules extends ServerNetworkNodeModules<Protocols_> = ServerNetworkNodeModules<Protocols_>,
    SocketInfo = unknown,
>
    extends NetworkNodeConnection<Protocols_> {
    get serverSocket() {
        return <ServerSocketWith<Protocols_, SocketInfo>><unknown>this.socket
    }

    constructor(
        self: ServerNetworkNode<Protocols_, Modules, SocketInfo>,
        socket: ServerSocketWith<Protocols_, SocketInfo>
    ) {
        super(
            self,
            <SocketWith<Protocols_>><unknown>socket
        )
    }

    override async [Symbol.asyncDispose](): Promise<void> {
        await super[Symbol.asyncDispose]()

        this.serverSocket.disconnect(true)
    }
}
