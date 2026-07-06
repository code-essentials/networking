import { AsyncVariable, ObservableList } from "@code-essentials/utils"
import { connect, listen, ListenProtocols, PeerToPeerProtocols, ProtocolListener, Protocols, SocketWith, type HalfProtocols } from "./communication.js"
import { ManagerOptions, SocketOptions } from "socket.io-client"

export const NetworkProtocolPrefix = "network"
export const NetworkReadyProtocol = `${NetworkProtocolPrefix}.ready`

type NetworkPeerProtocols = HalfProtocols

type NetworkServerToClientProtocols = {
    [NetworkReadyProtocol](): typeof NetworkReadyProtocol
}

type NetworkClientToServerProtocols = HalfProtocols

export type NetworkPeerToPeerProtocols = PeerToPeerProtocols<NetworkPeerProtocols>

export type ServerNetworkProtocols = NetworkPeerToPeerProtocols & Protocols<NetworkServerToClientProtocols, NetworkClientToServerProtocols>
export type ClientNetworkProtocols = NetworkPeerToPeerProtocols & Protocols<NetworkClientToServerProtocols, NetworkServerToClientProtocols>

export interface NetworkNodeModule<
    out Protocols_ extends Protocols = Protocols,
    out NetworkProtocols extends Protocols_ = Protocols_,
    out SelfToPeer extends
    NetworkNodeConnection<NetworkProtocols> =
    NetworkNodeConnection<NetworkProtocols>,
    out Modules extends
    NetworkNodeModules<NetworkProtocols, SelfToPeer> =
    NetworkNodeModules<NetworkProtocols, SelfToPeer>,
    out Connection extends
    NetworkNodeModuleConnection<NetworkProtocols, SelfToPeer, Modules> =
    NetworkNodeModuleConnection<NetworkProtocols, SelfToPeer, Modules>,
    Settings = unknown,
> extends AsyncDisposable {
    readonly settings: Settings

    init?(self: NetworkNode<NetworkProtocols, SelfToPeer, Modules>): Promise<void> | void
    connect(connection: SelfToPeer): Connection | Promise<Connection>
}

export type NetworkNodeModuleSettings<Module> =
    Module extends NetworkNodeModule<
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        infer _Protocols,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        infer _SelfToPeer,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        infer _Modules,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        infer _Connection,
        infer Settings
    > ? Settings : never

export type NetworkNodeModulesFactory<
    out NetworkProtocols extends Protocols = Protocols,
    out SelfToPeer extends
    NetworkNodeConnection<NetworkProtocols> =
    NetworkNodeConnection<NetworkProtocols>,
    out Modules extends
    NetworkNodeModules<NetworkProtocols, SelfToPeer> =
    NetworkNodeModules<NetworkProtocols, SelfToPeer>,
    Config = void,
    Modules1 extends Partial<Modules> = Partial<Modules>,
> =
    (config: Config) => Modules1

export interface NetworkNodeModuleConnection<
    out NetworkProtocols extends Protocols = Protocols,
    out SelfToPeer extends
    NetworkNodeConnection<NetworkProtocols> =
    NetworkNodeConnection<NetworkProtocols>,
    out Modules extends
    NetworkNodeModules<NetworkProtocols, SelfToPeer> =
    NetworkNodeModules<NetworkProtocols, SelfToPeer>,
    out ModuleName extends keyof Modules = keyof Modules,
> extends AsyncDisposable {
    readonly module: Modules[ModuleName]
    readonly connection: SelfToPeer
}

export abstract class ListeningNetworkNodeModuleConnection<
    out Protocols_ extends Protocols = Protocols,
    out NetworkProtocols extends Protocols_ = Protocols_,
    out SelfToPeer extends
    NetworkNodeConnection<NetworkProtocols> =
    NetworkNodeConnection<NetworkProtocols>,
    out Modules extends
    NetworkNodeModules<NetworkProtocols, SelfToPeer> =
    NetworkNodeModules<NetworkProtocols, SelfToPeer>,
    out ModuleName extends keyof Modules = keyof Modules,
>
    implements NetworkNodeModuleConnection<NetworkProtocols, SelfToPeer, Modules> {
    readonly listener: ProtocolListener<Protocols_>
    get module() {
        return <Modules[ModuleName]><unknown>this.connection.self.modules[this.moduleName]
    }

    constructor(
        readonly connection: SelfToPeer,
        readonly moduleName: ModuleName,
    ) {
        this.listener = listen(this.connection.socket, this.listeners())
    }

    protected abstract listeners(): Partial<ListenProtocols<Protocols_>>

    // eslint-disable-next-line @typescript-eslint/require-await
    async [Symbol.asyncDispose]() {
        this.listener[Symbol.dispose]()
    }
}

export type NetworkNodeModules<
    out NetworkProtocols extends Protocols = Protocols,
    out SelfToPeer extends NetworkNodeConnection<NetworkProtocols> = NetworkNodeConnection<NetworkProtocols>,
> = {
    [module: string | symbol]: NetworkNodeModule<Protocols, NetworkProtocols, SelfToPeer>
}

export type NetworkNodeModuleConnections<
    out NetworkProtocols extends Protocols = Protocols,
    out SelfToPeer extends NetworkNodeConnection<NetworkProtocols> = NetworkNodeConnection<NetworkProtocols>,
    out Modules extends NetworkNodeModules<NetworkProtocols, SelfToPeer> = NetworkNodeModules<NetworkProtocols, SelfToPeer>,
> = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        [module in keyof Modules]: Modules[module] extends NetworkNodeModule<infer _Protocols, infer _NetworkProtocols, infer _SelfToPeer, infer _Modules, infer Connection> ?
        Connection :
        NetworkNodeModuleConnection<NetworkProtocols, SelfToPeer>
    }

export class NetworkNode<
    out NetworkProtocols extends Protocols = Protocols,
    out SelfToPeer extends NetworkNodeConnection<NetworkProtocols> = NetworkNodeConnection<NetworkProtocols>,
    out Modules extends NetworkNodeModules<NetworkProtocols, SelfToPeer> = NetworkNodeModules<NetworkProtocols, SelfToPeer>,
>
    implements AsyncDisposable {
    readonly connections = new ObservableList<SelfToPeer>()

    constructor(
        readonly modules: Modules
    ) {
    }

    async init() {
        await Promise.all(Object.values(this.modules).map(async module => await module.init?.(this)))
    }

    async [Symbol.asyncDispose]() {
        await Promise.all(this.connections.map(connection => connection[Symbol.asyncDispose]()))
    }
}

export class NetworkNodeConnection<
    out NetworkProtocols extends Protocols = Protocols,
>
    implements AsyncDisposable {
    readonly #self: NetworkNode<NetworkProtocols>
    readonly #socket: SocketWith<NetworkProtocols>
    readonly #connections = new AsyncVariable<NetworkNodeModuleConnections<NetworkProtocols>>()

    get self() {
        return this.#self
    }

    get socket() {
        return this.#socket
    }

    get connections() {
        return this.#connections.value
    }

    constructor(
        self: NetworkNode<NetworkProtocols>,
        socket: SocketWith<NetworkProtocols>,
    ) {
        this.#self = self
        this.#socket = socket
    }

    async initialize() {
        await this.#connections.perform(() => this.#initialize())
    }

    async [Symbol.asyncDispose]() {
        await Promise.all(Object.values(await this.#connections).map(async connection => await connection[Symbol.asyncDispose]()))
    }

    async #initialize() {
        return <NetworkNodeModuleConnections<NetworkProtocols>>
            Object.fromEntries(
                await Promise.all(
                    Object.entries(this.self.modules)
                        .map(async ([name, module]) =>
                            [name, await module.connect(this)] as const
                        )
                )
            )
    }
}

export class NetworkClientNodeModule<
    out NetworkProtocols extends ClientNetworkProtocols = ClientNetworkProtocols,
    out SelfToPeer extends ClientToServerNetworkConnection<NetworkProtocols> = ClientToServerNetworkConnection<NetworkProtocols>,
>
    implements NetworkNodeModule<
        ClientNetworkProtocols,
        NetworkProtocols,
        SelfToPeer,
        ClientNetworkNodeModules<NetworkProtocols, SelfToPeer>,
        ClientNetworkNodeModuleConnection<NetworkProtocols, SelfToPeer>,
        never
    > {
    readonly settings!: never

    connect(connection: SelfToPeer): ClientNetworkNodeModuleConnection<NetworkProtocols, SelfToPeer> {
        return new ClientNetworkNodeModuleConnection(connection)
    }

    async [Symbol.asyncDispose]() { }
}

export class ClientNetworkNodeModuleConnection<
    out NetworkProtocols extends ClientNetworkProtocols = ClientNetworkProtocols,
    out SelfToPeer extends ClientToServerNetworkConnection<NetworkProtocols> = ClientToServerNetworkConnection<NetworkProtocols>,
>
    extends ListeningNetworkNodeModuleConnection<
        ClientNetworkProtocols,
        NetworkProtocols,
        SelfToPeer,
        ClientNetworkNodeModules<NetworkProtocols, SelfToPeer>,
        ClientNetworkNodeModuleName
    > {
    readonly serverReady = new AsyncVariable<void>()
    #disposing = false
    readonly #disposed = new AsyncVariable<void>()

    get disposed(): AsyncVariable<void> | undefined {
        return this.#disposing ? this.disposed : undefined
    }

    constructor(
        connection: SelfToPeer,
        readonly serverReadyTimeout = 10_000
    ) {
        super(
            connection,
            ClientNetworkNodeModuleName
        )

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        connection.socket.on("disconnect", async (_reason, _desc) => {
            this.#disposing = true
            await connection[Symbol.asyncDispose]()
            this.#disposed.set()
        })

        this.serverReady.timeout(serverReadyTimeout)
    }

    protected override listeners() {
        return <Partial<ListenProtocols<NetworkProtocols>>>{
            [NetworkReadyProtocol]: () => {
                if (!this.serverReady.complete)
                    this.serverReady.set()

                return NetworkReadyProtocol
            }
        }
    }
}

export const ClientNetworkNodeModuleName = "client"
export type ClientNetworkNodeModuleName = typeof ClientNetworkNodeModuleName

export type ClientNetworkNodeModules<
    out NetworkProtocols extends ClientNetworkProtocols = ClientNetworkProtocols,
    out SelfToPeer extends ClientToServerNetworkConnection<NetworkProtocols> = ClientToServerNetworkConnection<NetworkProtocols>,
> = {
    [ClientNetworkNodeModuleName]: NetworkClientNodeModule<NetworkProtocols, SelfToPeer>
}

// type ClientNetworkNodeModules<Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols> = ReturnType<typeof ClientNetworkNodeModulesFactory<Protocols_>>[ClientNetworkNodeModuleName]

export function ClientNetworkNodeModulesFactory<
    NetworkProtocols extends ClientNetworkProtocols = ClientNetworkProtocols,
    SelfToPeer extends ClientToServerNetworkConnection<NetworkProtocols> = ClientToServerNetworkConnection<NetworkProtocols>,
>() {
    return ({
        client: new NetworkClientNodeModule<NetworkProtocols, SelfToPeer>()
    })
}

ClientNetworkNodeModulesFactory satisfies NetworkNodeModulesFactory<
    ClientNetworkProtocols,
    ClientToServerNetworkConnection<ClientNetworkProtocols>,
    ClientNetworkNodeModules,
    void,
    ClientNetworkNodeModules
>

export class ClientNetworkNode<
    out NetworkProtocols extends ClientNetworkProtocols = ClientNetworkProtocols,
    out Modules extends ClientNetworkNodeModules & NetworkNodeModules<NetworkProtocols, ClientToServerNetworkConnection<NetworkProtocols>> = ClientNetworkNodeModules & NetworkNodeModules<NetworkProtocols, ClientToServerNetworkConnection<NetworkProtocols>>,
>
    extends NetworkNode<NetworkProtocols, ClientToServerNetworkConnection<NetworkProtocols>, Modules> {
    async connect(uri: string, options?: Partial<SocketOptions & ManagerOptions>) {
        const socket = await connect<NetworkProtocols>(uri, options)

        const connection = new ClientToServerNetworkConnection<NetworkProtocols>(this, socket)
        this.connections.push(connection)
        await connection.initialize()

        return connection
    }
}

export class ClientToServerNetworkConnection<
    out NetworkProtocols extends ClientNetworkProtocols = ClientNetworkProtocols
>
    extends NetworkNodeConnection<NetworkProtocols> {
    constructor(
        self: ClientNetworkNode<NetworkProtocols>,
        socket: SocketWith<NetworkProtocols>,
    ) {
        super(self, socket)
    }

    override async [Symbol.asyncDispose]() {
        await super[Symbol.asyncDispose]()
        this.socket.close()
    }

    override async initialize(): Promise<void> {
        await super.initialize()
        const { client } = <NetworkNodeModuleConnections<NetworkProtocols, ClientToServerNetworkConnection<NetworkProtocols>, ClientNetworkNodeModules<NetworkProtocols>>>this.connections
        await client.serverReady
    }
}
