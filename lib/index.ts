import EventEmitter from "events";
import express from "express";
import Mingo from "mingo";
import fetch from "node-fetch";

type Dict<T> = Record<string, T>;

interface SchemaTypeConfig<D> {
    webhook: boolean;
    onIncoming: (documents: D[], actor: Actor) => any;
    persist?: boolean;
    allowSubscribe?: boolean;
}

interface SubscriptionHandlerOptions<D extends SchemaType = SchemaType> {
    hydrate?: (subscription: SubscribeCommand) => D[];
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

export interface SubscribeCommand extends Command {
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
                const docs = req.body as SchemaType[];
                const endpoints = Object.keys(this.subscriptions);
                endpoints.forEach((endpoint) => {
                    const subscription = this.subscriptions[endpoint];
                    if (schematype === subscription.params.schemaType) {
                        this.relayToSubscription(docs, subscription);
                    }
                });
                if (schemaConfig.onIncoming) {
                    const result = await schemaConfig.onIncoming(docs, this);
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

    /**
     * registers a schematype. This creates an api endpoint on the actor where
     * documents of that schematype can be send to.
     * @param schemaType 
     * @param config 
     */
    public register<D extends SchemaType>(
        schemaType: D["schemaType"],
        config: SchemaTypeConfig<D>
    ) {
        this.config[schemaType] = config;
        if (config.allowSubscribe) {
            this.registerSubscriptionHandler(schemaType);
        }
    }

    /**
     * registers a command endpoint, so the actor can receive commands
     * it calls `register` under the hood and adds a handler that emits a "command" event
     */
    public registerCommandHandler() {
        this.register<Command>("command", {
            onIncoming: (commandDocuments, self) => {
                console.log("incoming commands", commandDocuments.length);
                commandDocuments.forEach((document) => this.emit("command", document));
            },
            persist: false,
            webhook: true,
        });
    }

    /**
     * registers an event handler to incoming subscription commands. These are commands
     * of type `subscribe`, called subscriptions.
     * 
     * if the subscription has the `hydrate` option set to a function, it is called
     * when the subscription arrives. The function should return an array of documents
     * which are then sent to the subscription endpoint
     * 
     * when new documents are received, they are also relayed to the subscriptions,
     * if the query matches
     * 
     * @param schemaType 
     * @param options 
     */
    public registerSubscriptionHandler<D extends SchemaType = SchemaType>(
        schemaType: string,
        options: SubscriptionHandlerOptions<D> = {}
    ) {
        this.addListener("command", (subscription: SubscribeCommand) => {
            if (
                subscription.command === "subscribe" &&
                subscription.params.schemaType === schemaType
            ) {
                console.log("incoming subscription ", subscription);
                this.handleSubscription(subscription);
                if (options.hydrate && subscription.params.hydrate) {
                    let docs = options.hydrate(subscription);
                    this.relayToSubscription(docs, subscription);
                }
            }
        });
    }

    public getCapabilities() {
        return this.config;
    }

    public handleSubscription(document: SubscribeCommand) {
        this.subscriptions[document.params.webhook] = document;
        this.emit("subscription", document);
    }

    public relayToSubscription(
        documents: SchemaType[],
        subscription: SubscribeCommand
    ) {
        const query = new Mingo.Query(subscription.params.query || {});
        const matching = documents.filter((doc) => query.test(doc));
        if (matching.length) {
            return this.sendDocuments(subscription.params.webhook, matching);
        }
    }

    public sendDocuments(targetUrl: string, documents: SchemaType[]) {
        console.log("send to ", targetUrl);
        return fetch(targetUrl, {
            body: JSON.stringify(documents),
            headers: {
                "content-type": "application/json",
            },
            method: "POST",
        });
    }

    /**
     * sends a command to another server, which is just a special kind of document
     * calls sendDocuments under the hood
     */
    public sendCommand(targetUrl: string, command: string, params: Dict<any>, token: string) {
        let commandDoc: Command = {
            command, params, token, schemaType:'command'
        }
        return this.sendDocuments(`${targetUrl}/command`, [commandDoc]);
    }

    /**
     * subscribe to documents of another actor
     * note that these can be command documents (commands) as well
     * @param targetUrl 
     * @param schemaType 
     * @param params 
     */
    public subscribe(
        targetUrl: string,
        schemaType: string,
        params: Partial<SubscribeCommand["params"]> = {}
    ) {
        return this.sendCommand(targetUrl, 'subscribe', {
            schemaType,
            webhook: `${this.options.endpoint}/${schemaType}`,
            ...params,
        },'')
    }
}

export default Actor;
