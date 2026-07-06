declare module "socket.io-client/build/esm" {
    // interface not exported from socket.io
    export interface SocketReservedEvents {
        connect: () => void;
        connect_error: (err: Error) => void;
        disconnect: (reason: Socket.DisconnectReason, description?: DisconnectDescription) => void;
    }

    /**
     * Utility type to decorate the acknowledgement callbacks with a timeout error.
     *
     * This is needed because the timeout() flag breaks the symmetry between the sender and the receiver:
     *
     * @example
     * interface Events {
     *   "my-event": (val: string) => void;
     * }
     *
     * socket.on("my-event", (cb) => {
     *   cb("123"); // one single argument here
     * });
     *
     * socket.timeout(1000).emit("my-event", (err, val) => {
     *   // two arguments there (the "err" argument is not properly typed)
     * });
     *
     */
    export type DecorateAcknowledgements<E> = {
        [K in keyof E]: E[K] extends (...args: infer Params) => infer Result ? (...args: PrependTimeoutError<Params>) => Result : E[K];
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    export type Last<T extends any[]> = T extends [...infer H, infer L] ? L : any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    export type AllButLast<T extends any[]> = T extends [...infer H, infer L] ? H : any[];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    export type FirstArg<T> = T extends (arg: infer Param) => infer Result ? Param : any;
}