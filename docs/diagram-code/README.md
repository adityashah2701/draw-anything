# Diagram code

Diagram code is a small text language for drawing diagrams. Write it in the **Diagram code** panel; it draws on the canvas, and the canvas can be read back into code. Every example below is run by `features/diagram-code/docs.test.ts` (it must compile with no errors or warnings, format to itself, and draw), so what is written here works.

The canvas is the document and the code is a view of it. Invalid code never touches the canvas: the last valid drawing stays until the code is fixed.

## The basics

```diagram-code
title Sign in
Start [kind: start]
Enter email [label: "Enter email\nand password"]
Valid? [kind: decision]
Show error
Home [kind: end]

Start > Enter email
Enter email > Valid?
Valid? > Home: yes
Valid? > Show error: no
Show error > Enter email
```

- A line with a name declares a **node**. `A, B, C` declares several.
- `A > B` draws an arrow. `A < B` reverses it, `A <> B` points both ways, `A - B` is a plain line, `A --> B` and `A -- B` are dashed. `A > B > C` chains.
- `A > B: text` labels the arrow. `A > B: text [color: red, from: right, to: left]` adds colour and the sides it leaves and enters by.
- Names that use symbols (`[ ] { } " , :`) or start with `//`, `#`, `frame `, `group `, `title `, `type ` or `direction ` are written in quotes. Quotes also allow `\n`, `\"` and `\\`.
- `// comment` and lines starting with `#` are ignored.

## Properties

Properties go in square brackets after a name. Hover a property in the editor for its documentation; completion offers the valid names and values.

| Property | Applies to | Meaning |
| --- | --- | --- |
| `kind` | node | what it is (`service`, `database`, `queue`, `user`, `decision`, ...); picks icon and colours |
| `icon` | node | an icon id or alias from the icon library (`postgres`, `redis`, ...) |
| `shape` | node | `rectangle` (default), `diamond`, `pill`, `icon`, `cylinder`, `cloud`, `document`, `hexagon`, `parallelogram` |
| `label` | node, group, frame | the text shown, when it differs from the name |
| `color` | node, frame, connection | a colour name (`blue`) or `#rrggbb` |
| `dashed` | node | dashed outline |
| `x`, `y`, `w`, `h` | node, frame | exact position (top-left) and size |
| `padding` | frame | space between a frame's border and its contents |
| `from`, `to` | connection | side the line leaves / enters: `top`, `right`, `bottom`, `left` |

Kinds: service, database, server, api, queue, cache, storage, cdn, dns, firewall, waf, load-balancer, internet, kubernetes, pod, cluster, container, worker, service-mesh, deployment, namespace, region, availability-zone, vm, user, mobile, browser, lambda, event-bus, secrets, authentication, gateway, message-broker, ai-model, agent, tool, memory, knowledge-base, vector-store, dashboard, alerting, config, cicd, workflow, start, end, decision, parallel, retry, loop, external, generic.

Header lines (`title`, `type`, `direction`) come first. `type` is one of `architecture`, `flowchart`, `concept`, `mind-map`, `sequence`, `network`, `entity-relationship`, `workflow`, `class`, `organization`, `dependency`. **Limit:** `type` is recorded, but every type is laid out by the same graph layout. There are no sequence lifelines, mind-map radial layout or UML class compartments; do not expect them. `direction` is accepted and has **no effect** on the layout yet.

## Groups and frames

A **group** (`Name { ... }` or `group Name { ... }`) is a labelled box around nodes. A **frame** (`frame Name [props] { ... }`) is a titled container on the canvas: it can hold nodes, groups and other frames, and moves and exports with its contents. A group cannot hold a frame.

```diagram-code
type architecture
title Shop

frame Public [color: blue, label: "Public edge"] {
  CDN [kind: cdn]
  Gateway [kind: gateway]
}
frame Backend [label: "Backend services"] {
  group Services {
    Orders [kind: service]
    Billing [kind: service]
  }
  Orders DB [kind: database]
}
Browser [kind: browser]

Browser > CDN
CDN > Gateway
Gateway > Orders
Gateway > Billing
Orders > Orders DB: SQL
Billing > Orders DB: SQL
```

Without `x`, `y`, `w`, `h` a frame wraps its contents; on update the box you drew stays and only grows when something would stick out. With them the frame uses exactly that box (a warning appears if the contents do not fit).

## Examples by diagram type

### Flowchart

```diagram-code
type flowchart
title Order approval
Start [kind: start]
Submit order
In stock? [kind: decision]
Reserve stock
Back-order
Approved [kind: end]

Start > Submit order > In stock?
In stock? > Reserve stock: yes
In stock? > Back-order: no
Reserve stock > Approved
Back-order > Approved: later
```

### Database (entity-relationship)

Entities are nodes; relationships are labelled lines. There are no crow's-foot symbols or column lists.

```diagram-code
type entity-relationship
title Library
Member [kind: database]
Loan [kind: database]
Book [kind: database]
Author [kind: database]

Member - Loan: borrows
Loan - Book: of
Book - Author: written by
```

### Cloud / backend architecture

```diagram-code
type architecture
title Event pipeline
Web [kind: browser]
API [kind: api]
Orders [kind: service]
Bus [kind: event-bus]
Worker [kind: worker]
Orders DB [kind: database]
Cache [kind: cache]

Web > API: HTTPS
API > Orders
Orders > Orders DB: SQL
Orders > Cache
Orders > Bus: publish
Bus > Worker
Worker > Orders DB
```

### Network

```diagram-code
type network
title Office network
Internet [kind: internet]
Firewall [kind: firewall]
Router [kind: server]
Switch [kind: server]
Laptops [kind: user]
Printer [kind: server]

Internet <> Firewall
Firewall > Router
Router > Switch
Switch > Laptops
Switch > Printer: LAN
```

### Component architecture

```diagram-code
type architecture
title Editor components
UI [kind: browser]
Store [kind: memory]
Renderer
Sync [kind: service]
Server [kind: server]

UI > Store: actions
Store > Renderer: state
Store <> Sync: operations
Sync <> Server: websocket
```

### Icon-rich

`shape: icon` draws a bare icon with its label underneath.

```diagram-code
type architecture
title Data stores
App [icon: browser, shape: icon]
Postgres [icon: postgres, shape: icon]
Redis [icon: redis, shape: icon]
Files [kind: storage, shape: icon]

App > Postgres
App > Redis
App > Files
```

## Outline shapes

`cylinder`, `cloud`, `document`, `hexagon` and `parallelogram` are drawn as outline shapes: one kind of element with a variant, so each is resizable, takes a label, a colour and connectors like any node. They are also in the shape picker (the hexagon button in the left toolbar) and the properties bar's Shape control, and a board edit of the variant is written back as `shape:`.

```diagram-code
type architecture

Orders DB [shape: cylinder, color: blue]
Provider [shape: cloud]
Invoice [shape: document]
Queue [shape: hexagon]
Import [shape: parallelogram]

Provider > Orders DB
Orders DB > Invoice
Queue > Import
```

A shape name the editor does not know (a typo, or one a newer version added) is reported with the list of real shapes, and the node is drawn as an ordinary rectangle node.

## Not supported

These are reported as diagnostics with a suggestion rather than silently ignored or faked:

- **Shapes** that are not in the list above (`star`, `octagon`, ...). The diagnostic names the shapes that exist, and the node is drawn as a rectangle.
- **Sequence diagrams** with lifelines and messages, **mind maps** with a radial layout, and **UML class diagrams** with member compartments. `type sequence`, `type mind-map` and `type class` only label the diagram.
- **`direction`**: parsed, no layout effect.

## Round trip

"Load" writes the canvas as code (with `x/y/w/h` and sides when positions are known). Editing and applying updates the same elements: unchanged declarations write nothing, a node you moved stays where you put it, and if you and the code changed the same field the editor asks which to keep. Known limits: resizing a node by hand is not kept by an update; renaming a node is a delete plus an add; a group whose nodes sit in different frames is left untouched on the board and not written to the code.
