import { io, ManagerOptions, Socket, SocketOptions } from "socket.io-client"
import { AsyncVariable } from "@code-essentials/utils"
import * as Parser from "socket.io-cbor-x-parser"

export type HalfProtocol = (...params: any[]) => any

export type HalfProtocols = {
    [event: string]: HalfProtocol
}

export interface Protocols<Send extends HalfProtocols = HalfProtocols, Listen extends HalfProtocols = HalfProtocols> {
    send: Send
    listen: Listen
}

export type SendProtocols<Protocols_ extends Protocols> = Protocols_ extends Protocols<infer Send, infer _Listen> ? Send : never
export type ListenProtocols<Protocols_ extends Protocols> = Protocols_ extends Protocols<infer _Send, infer Listen> ? Listen : never

export type PeerToPeerProtocols<HalfProtocols_ extends HalfProtocols> = Protocols<HalfProtocols_, HalfProtocols_>

export type Callback<Result = unknown> = (errResult: [error: unknown] | [error: undefined, result: Result]) => void

export type HalfProtocolToEvent<HalfProtocol_ extends HalfProtocol> =
    (...parameters: [...Parameters<HalfProtocol_>, callback: Callback<ReturnType<HalfProtocol_>>]) => void

export type HalfProtocolsToEvents<HalfProtocols_ extends HalfProtocols> =
    { [K in keyof HalfProtocols_]: HalfProtocolToEvent<HalfProtocols_[K]> }

export class ProtocolListener<Protocols_ extends Protocols = Protocols> implements Disposable {
    readonly #listeners: Partial<HalfProtocolsToEvents<ListenProtocols<Protocols_>>>
    #registered = false

    get registered() {
        return this.#registered
    }

    set registered(registered) {
        if (registered === this.registered)
            return

        if (registered)
            this.#register()
        else
            this.#unregister()
    }

    constructor(
            readonly socket: SocketWith<Protocols_>,
            readonly listeners: Partial<ListenProtocols<Protocols_>>,
            register = true,
        ) {
        this.#listeners = <Partial<HalfProtocolsToEvents<ListenProtocols<Protocols_>>>>
            Object.fromEntries(
                <any>Object.entries(listeners)
                    .filter(([_, handler]) => handler !== undefined)
                    .map(
                        ([key, handler]) => [
                            key,
                            async (...parameters: any[]) => {
                                const callback = <Callback>parameters.splice(parameters.length - 1, 1)[0]!

                                try {
                                    const result = await handler.call(listeners, ...parameters)
                                    callback([undefined, result])
                                }
                                catch (err) {
                                    if (err instanceof Error)
                                        err = err.stack ?? err.message
                                    callback([err])
                                }
                            }
                        ] as const
                    )
            )
        
        this.registered = register
    }

    #register() {
        if (!this.#registered) {
            this.#registered = true
            for (const [key, listener] of Object.entries(this.#listeners))
                this.socket.on(key, listener)
        }
    }

    #unregister() {
        if (this.#registered) {
            this.#registered = false
            for (const [key, listener] of Object.entries(this.#listeners))
                this.socket.off(key, listener)
        }
    }

    [Symbol.dispose]() {
        this.#unregister()
    }
}

export function listen<
        const Protocols_ extends Protocols = Protocols,
    >(
        socket: SocketWith<Protocols_>,
        listeners: Partial<ListenProtocols<Protocols_>>,
        register = true
    ): ProtocolListener<Protocols_> {
    return new ProtocolListener(socket, listeners, register)
}

export async function send<
        const Protocols_ extends Protocols = Protocols,
        Protocol_ extends keyof SendProtocols<Protocols_> = keyof SendProtocols<Protocols_>,
    >(
        socket: SocketWith<Protocols_> | SocketWithDelivery<Protocols_>,
        protocol: Protocol_,
        ...args: Parameters<SendProtocols<Protocols_>[Protocol_]>
    ): Promise<Awaited<ReturnType<SendProtocols<Protocols_>[Protocol_]>>> {
    const result = new AsyncVariable<Awaited<ReturnType<SendProtocols<Protocols_>[Protocol_]>>>
    const socket_ = <SocketWith<Protocols_>>('delivery' in socket ? socket.socket : socket)
    const delivery = ('delivery' in socket ? socket.delivery : undefined) ?? defaultDeliveryParameters
    const socket_timeout = socket_.timeout(delivery.timeout)

    for (let i = 0; !(result.complete || i === delivery.maxRetries); i++) {
        try {
            const [err, res] = <any>await socket_timeout.emitWithAck(<any>protocol, ...(<any>args))
            if (err) await result.error(err)
            else await result.set(res)
        }
        catch (x) {
            if (x instanceof Error && x.message === 'operation has timed out')
                continue
        
            await result.error(x)
        }
    }

    if (!result.complete)
        await result.error(new Error("timed out"))

    return await result
}

export interface DeliveryParameters {
    timeout: number
    maxRetries: number
}

export const defaultDeliveryParameters: DeliveryParameters = {
    timeout: 100,
    maxRetries: 5
}

export interface SocketWithDelivery<Protocols_ extends Protocols> {
    socket: SocketWith<Protocols_>
    delivery?: DeliveryParameters
}

export function deliveryWith<Protocols_ extends Protocols>(
        socket: SocketWith<Protocols_>,
        delivery?: Partial<DeliveryParameters>
    ): SocketWithDelivery<Protocols_> {
    return {
        socket,
        delivery: {
            ...defaultDeliveryParameters,
            ...delivery,
        }
    }
}

export type SocketWith<Protocols_ extends Protocols> = Socket<HalfProtocolsToEvents<Protocols_["listen"]>, HalfProtocolsToEvents<Protocols_["send"]>>

export const parser = Parser

export async function connect<Protocols_ extends Protocols>(...params: Parameters<typeof io>): Promise<SocketWith<Protocols_>> {
    const uri = typeof params[0] === 'string' ? params[0] : undefined
    const opts = <Partial<ManagerOptions & SocketOptions>>(params.length === 2 ? params[1] : params[0])
    const opts_noAutoConnect: typeof opts = {
        ...opts,
        parser,
        autoConnect: false,
    }

    const socket = io(uri, opts_noAutoConnect)
    const connected = new AsyncVariable<void>()
    socket.on('connect', () => connected.set())
    socket.connect()
    await connected

    return <SocketWith<Protocols_>>socket
}
