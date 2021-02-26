# description

Actor module, handling actor communication and subscriptions

to use as module in a project, clone the repository locall, then use `npm install ../module-actor`, which installs the module as a file reference

# Actor communication

All actors have endpoints for schematypes they can handle. Example is the Command Actor

A `POST` to `/actor/command` sends a command document to the server. Any actor may choose to persist these. In case of the Command Actor, it does not, as commands are ephemeral.

Any actor can implement a `/actor/command` endpoint if they which, but that would require all actors to know of each others existence. This is the raison d'etre for the Command Actor.

Rather than hardcoding all actor endpoints, actors can send a `subscribe` command to the Command Actor. The `subscribe` command has the following interface:

```json
{
    "schemaType": "command",
    "command": "subscribe",
    "token": "--token--",
    "params": {
        "webhook": "url",
        "schemaType": "command",
        "throttle": 1,
        "maxSize": 1024,
        "hydrate": true,
        "query": {}
    }
}
```

Any command has a `command` field and `params` field. Params differ per command. In case of the `subscribe` command, it contains information about the subscription. Specifically, it contains a `webhook` url which gets called by the Command Actor when new commands arrive.

# typical scenario

We have 3 actors:

-   `C`: Command Actor: relaying commands
-   `F`: Form Actor: receiving evaluation forms through a user interface
-   `A`: Aggregator Actor: aggregating evaluation forms

## setup procedure

-   `F -> C` POST /actor/command: subscription to `command` schematypes on `/actor/command`
-   `A -> C` POST /actor/command: subscription to `form` schematypes on `/actor/form`
-   `C -> F` POST /actor/command: forward subscription of the `form` schematypes, since `F` is subscribed to all commands
-   `F -> A` POST /actor/form: Form Actor sends currently stored forms matching query to Aggregator
-   `F -> A` POST /actor/form: when user creates a new form, these are forwarded to the Aggregator

# other scenarios

## Actor is the command actor

The command actor is somewhat special, as it handles `command` schematypes. It acts as a central server and other actors may use this for discovery purposes if they don't have knowledge of the ecosystem.

Each actor automatically registers an endpoint for the `command` schematype.

The command actor also registers a subscription handler for the `command` schematype, meaning it responds to commands with the command `subscribe` for the schematype `command`.

In other words, actors can react to commands. A `subscribe` command is one such command, subscribing to documents of a particular schematype. In this case, the command actor handles subscriptions to new `command` documents.

In yet other words, this server reacts when other actors subscribe to `command` documents. It does so by relaying incoming commands to the webhook indicated by the subscription (if queries match). Also it may burst persisted commands if indicated by the remote actor

## Actor comes online

Any actor typically registers a schematype that the actor cares about. For example, the `form` actor registers a `form` schematype, meaning it can receive forms via a `/forms` endpoint. If indicated by the registration, the actor also starts listening to incoming `subscribe` commands for the schematype:

```typescript
actor.register("form", {
    onIncoming: (document) => {
        console.log("incoming form");
        // store locally
    },
    webhook: true,
    allowSubscribe: true, // also listen to incoming subscriptions on forms
});
```

Listening to `subscribe` commands happens on the (automatically created) `/command` endpoint. These commands may be sent directly ("consiously") by remote actors if they know the endpoint url.

However, a more common scenario is that remote actors do not know the endpoint url, so the send the command to the command server, which relays it as described above.

In order to receive those commands, the actor needs to subscribe to them at the command server:

```typescript
actor.subscribe(commandServer, "command", {
    hydrate: true,
    query: { command: "subscribe", "params.schemaType": "form" },
});
```

# project setup

followed https://www.twilio.com/blog/2017/06/writing-a-node-module-in-typescript.html for project setup
