import { AsyncVariable, ObservableList } from "@code-essentials/utils"
import { connect, listen, ListenProtocols, PeerToPeerProtocols, ProtocolListener, Protocols, SocketWith } from "./communication.js"
import { ManagerOptions, SocketOptions } from "socket.io-client"

export const NetworkProtocolPrefix = "network"
export const NetworkReadyProtocol = `${NetworkProtocolPrefix}.ready`

type NetworkPeerProtocols = {
}

type NetworkServerToClientProtocols = {
    [NetworkReadyProtocol](): typeof NetworkReadyProtocol
}

type NetworkClientToServerProtocols = {
}

export type NetworkPeerToPeerProtocols = PeerToPeerProtocols<NetworkPeerProtocols>

export type ServerNetworkProtocols = NetworkPeerToPeerProtocols & Protocols<NetworkServerToClientProtocols, NetworkClientToServerProtocols>
export type ClientNetworkProtocols = NetworkPeerToPeerProtocols & Protocols<NetworkClientToServerProtocols, NetworkServerToClientProtocols>

export interface NetworkNodeModule<
        out Protocols_ extends Protocols = Protocols,
        out SelfToPeer extends
            NetworkNodeConnection<Protocols_> =
            NetworkNodeConnection<Protocols_>,
        out Modules extends
            NetworkNodeModules<Protocols_, SelfToPeer> =
            NetworkNodeModules<Protocols_, SelfToPeer>,
        out Connection extends
            NetworkNodeModuleConnection<Protocols_, SelfToPeer, Modules> =
            NetworkNodeModuleConnection<Protocols_, SelfToPeer, Modules>,
        Settings = any,
    > extends AsyncDisposable {
    readonly settings: Settings
    
    init?(self: NetworkNode<Protocols_, SelfToPeer, Modules>): Promise<void> | void
    connect(connection: SelfToPeer): Connection | Promise<Connection>
}

export type NetworkNodeModuleSettings<Module> =
    Module extends NetworkNodeModule<
        infer _Protocols,
        infer _SelfToPeer,
        infer _Modules,
        infer _Connection,
        infer Settings
    > ? Settings : never

export type NetworkNodeModulesFactory<
        out Protocols_ extends Protocols = Protocols,
        out SelfToPeer extends
            NetworkNodeConnection<Protocols_> =
            NetworkNodeConnection<Protocols_>,
        out Modules extends
            NetworkNodeModules<Protocols_, SelfToPeer> =
            NetworkNodeModules<Protocols_, SelfToPeer>,
            Config = void,
        Modules1 extends Partial<Modules> = Partial<Modules>,
    > =
    (config: Config) => Modules1

export interface NetworkNodeModuleConnection<
        out Protocols_ extends Protocols = Protocols,
        out SelfToPeer extends
            NetworkNodeConnection<Protocols_> =
            NetworkNodeConnection<Protocols_>,
        out Modules extends
            NetworkNodeModules<Protocols_, SelfToPeer> =
            NetworkNodeModules<Protocols_, SelfToPeer>,
        out ModuleName extends keyof Modules = keyof Modules,
    > extends AsyncDisposable {
    readonly module: Modules[ModuleName]
    readonly connection: SelfToPeer
}

export abstract class ListeningNetworkNodeModuleConnection<
        out Protocols_ extends Protocols = Protocols,
        out SelfToPeer extends
            NetworkNodeConnection<Protocols_> =
            NetworkNodeConnection<Protocols_>,
        out Modules extends
            NetworkNodeModules<Protocols_, SelfToPeer> =
            NetworkNodeModules<Protocols_, SelfToPeer>,
        out ModuleName extends keyof Modules = keyof Modules,
    >
    implements NetworkNodeModuleConnection<Protocols_, SelfToPeer, Modules> {
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

    async [Symbol.asyncDispose]() {
        this.listener[Symbol.dispose]()
    }
}

export type NetworkNodeModules<
        out Protocols_ extends Protocols = Protocols,
        out SelfToPeer extends NetworkNodeConnection<Protocols_> = NetworkNodeConnection<Protocols_>,
    > = {
    [module: string | symbol]: NetworkNodeModule<Protocols_, SelfToPeer>
}

export type NetworkNodeModuleConnections<
        Protocols_ extends Protocols = Protocols,
        SelfToPeer extends NetworkNodeConnection<Protocols_> = NetworkNodeConnection<Protocols_>,
        Modules extends NetworkNodeModules<Protocols_, SelfToPeer> = NetworkNodeModules<Protocols_, SelfToPeer>,
    > = {
    [module in keyof Modules]: Modules[module] extends NetworkNodeModule<Protocols_, SelfToPeer, infer _Modules, infer Connection> ? Connection : NetworkNodeModuleConnection<Protocols_, SelfToPeer>
}

export class NetworkNode<
        Protocols_ extends Protocols = Protocols,
        SelfToPeer extends NetworkNodeConnection<Protocols_> = NetworkNodeConnection<Protocols_>,
        Modules extends NetworkNodeModules<Protocols_, SelfToPeer> = NetworkNodeModules<Protocols_, SelfToPeer>,
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
        out Protocols_ extends Protocols = Protocols,
    >
    implements AsyncDisposable {
    readonly #self: NetworkNode<Protocols_>
    readonly #socket: SocketWith<Protocols_>
    readonly #connections = new AsyncVariable<NetworkNodeModuleConnections<Protocols_>>()

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
            self: NetworkNode<Protocols_>,
            socket: SocketWith<Protocols_>,
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
        return <NetworkNodeModuleConnections<Protocols_>>
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
        Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols,
    >
    implements NetworkNodeModule<
        Protocols_,
        ClientToServerNetworkConnection<Protocols_>,
        ClientNetworkNodeModules<Protocols_>,
        ClientNetworkNodeModuleConnection<Protocols_>,
        never
    > {
    readonly settings!: never
    
    connect(connection: ClientToServerNetworkConnection<Protocols_>): ClientNetworkNodeModuleConnection<Protocols_> {
        return new ClientNetworkNodeModuleConnection(connection)
    }

    async [Symbol.asyncDispose]() { }
}

export class ClientNetworkNodeModuleConnection<
        Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols
    >
    extends ListeningNetworkNodeModuleConnection<
        Protocols_,
        ClientToServerNetworkConnection<Protocols_>,
        ClientNetworkNodeModules<Protocols_>,
        ClientNetworkNodeModuleName
    > {
    readonly serverReady = new AsyncVariable<void>()
    #disposing = false
    readonly #disposed = new AsyncVariable<void>()

    get disposed(): AsyncVariable<void> | undefined {
        return this.#disposing ? this.disposed : undefined
    }

    constructor(
            connection: ClientToServerNetworkConnection<Protocols_>,
            readonly serverReadyTimeout = 10_000
        ) {
        super(
            connection,
            ClientNetworkNodeModuleName
        )

        connection.socket.on("disconnect", async (_reason, _desc) => {
            await this.#disposed.init()
            this.#disposing = true
            await connection[Symbol.asyncDispose]()
            await this.#disposed.set()
        })

        this.serverReady.timeout(serverReadyTimeout)
    }

    protected override listeners() {
        return <Partial<ListenProtocols<Protocols_>>>{
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

export type ClientNetworkNodeModules<Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols> = {
    [ClientNetworkNodeModuleName]: NetworkClientNodeModule<Protocols_>
}

// type ClientNetworkNodeModules<Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols> = ReturnType<typeof ClientNetworkNodeModulesFactory<Protocols_>>[ClientNetworkNodeModuleName]

export function ClientNetworkNodeModulesFactory<Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols>() {
    return ({
        client: new NetworkClientNodeModule<Protocols_>()
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
        Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols,
        Modules extends ClientNetworkNodeModules & NetworkNodeModules<Protocols_, ClientToServerNetworkConnection<Protocols_>> = ClientNetworkNodeModules & NetworkNodeModules<Protocols_, ClientToServerNetworkConnection<Protocols_>>,
    >
    extends NetworkNode<Protocols_, ClientToServerNetworkConnection<Protocols_>, Modules> {
    async connect(uri: string, options?: Partial<SocketOptions & ManagerOptions>) {
        const socket = await connect<Protocols_>(uri, options)
        
        const connection = new ClientToServerNetworkConnection<Protocols_>(this, socket)
        this.connections.push(connection)
        await connection.initialize()

        return connection
    }
}

export class ClientToServerNetworkConnection<Protocols_ extends ClientNetworkProtocols = ClientNetworkProtocols>
    extends NetworkNodeConnection<Protocols_> {
    constructor(
            self: ClientNetworkNode<Protocols_>,
            socket: SocketWith<Protocols_>,
        ) {
        super(self, socket)
    }

    override async [Symbol.asyncDispose]() {
        await super[Symbol.asyncDispose]()
        this.socket.close()
    }

    override async initialize(): Promise<void> {
        await super.initialize()
        const { client } = <NetworkNodeModuleConnections<Protocols_, ClientToServerNetworkConnection<Protocols_>, ClientNetworkNodeModules<Protocols_>>>this.connections
        await client.serverReady
    }
}
