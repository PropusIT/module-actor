import EventEmitter from "events";
import express from "express";
import Mingo from "mingo";
import fetch from "node-fetch";

type Dict<T> = Record<string, T>;

interface SchemaTypeConfig<D> {
    webhook: boolean;
    onIncoming: (document: D, actor: Actor) => any;
    persist?: boolean;
    allowSubscribe?: boolean;
}

interface SchemaType extends Dict<any> {
    schemaType: string;
}

export interface Command extends SchemaType {
    command: string;
    params: Dict<any>;
    schemaType: "command";
    token: string;
}

interface SubscribeCommand extends Command {
    command: "subscribe";
    params: {
        webhook: string;
        schemaType: string;
        throttle?: number;
        maxSize?: number;
        hydrate?: boolean;
        query?: Dict<any>;
    };
}

type ActorConfig = Dict<SchemaTypeConfig<any>>;

interface ActorOptions {
    endpoint: string;
}

export class Actor extends EventEmitter {
    private subscriptions: Dict<SubscribeCommand> = {};
    private config: ActorConfig = {};

    constructor(public options: ActorOptions) {
        super();
        this.registerCommandHandler();
    }

    public get middleware() {
        const router = express.Router();

        Object.keys(this.config).forEach((schematype) => {
            const schemaConfig = this.config[schematype];
            router.post(`/${schematype}`, async (req, res) => {
                const doc = req.body as SchemaType;
                const endpoints = Object.keys(this.subscriptions);
                endpoints.forEach((endpoint) => {
                    const subscription = this.subscriptions[endpoint];
                    if (schematype === subscription.params.schemaType) {
                        const query = new Mingo.Query(
                            subscription.params.query || {}
                        );
                        if (query.test(doc)) {
                            this.relaySubscription(doc, subscription);
                        }
                    }
                });
                if (schemaConfig.onIncoming) {
                    const result = await schemaConfig.onIncoming(doc, this);
                    res.json(result || null);
                }
                res.end();
                // res.send(`post ${schematype}`);
            });
        });

        router.get("/capabilities", (req, res) => {
            res.json(this.getCapabilities());
        });
        router.get("/subscriptions", (req, res) => {
            res.json(this.subscriptions);
        });

        return router;
    }

    public register<D extends SchemaType>(
        schemaType: D["schemaType"],
        config: SchemaTypeConfig<D>
    ) {
        this.config[schemaType] = config;
        if (config.allowSubscribe) {
            this.registerSubscriptionHandler(schemaType);
        }
    }

    public registerCommandHandler() {
        this.register<Command>("command", {
            onIncoming: (document, self) => {
                console.log("incoming command", document.command);
                this.emit("command", document);
            },
            persist: false,
            webhook: true,
        });
    }

    public registerSubscriptionHandler(schemaType: string) {
        this.addListener("command", (document: SubscribeCommand) => {
            if (
                document.command === "subscribe" &&
                document.params.schemaType === schemaType
            ) {
                console.log("incoming subscription ", document);
                this.handleSubscription(document);
            }
        });
    }

    public getCapabilities() {
        return this.config;
    }

    public handleSubscription(document: SubscribeCommand) {
        this.subscriptions[document.params.webhook] = document;
    }

    public relaySubscription(
        document: SchemaType,
        subscription: SubscribeCommand
    ) {
        return this.sendDocument(subscription.params.webhook, document);
    }

    public sendDocument(targetUrl: string, document: SchemaType) {
        console.log("send to ", targetUrl);
        return fetch(targetUrl, {
            body: JSON.stringify(document),
            headers: {
                "content-type": "application/json",
            },
            method: "POST",
        });
    }

    public subscribe(
        targetUrl: string,
        schemaType: string,
        params: Partial<SubscribeCommand["params"]> = {}
    ) {
        return this.sendDocument(`${targetUrl}/command`, {
            command: "subscribe",
            params: {
                schemaType,
                webhook: `${this.options.endpoint}/${schemaType}`,
                ...params,
            },
            schemaType: "command",
            token: "",
        });
    }
}

export default Actor;
