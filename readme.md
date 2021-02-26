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

# project setup

followed https://www.twilio.com/blog/2017/06/writing-a-node-module-in-typescript.html for project setup
