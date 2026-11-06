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
| `shape` | node | `rectangle` (default), `diamond`, `pill`, `icon`, `cylinder`, `cloud`, `document`, `hexagon`, `parallelogram`, `queue`, `package`, `component`, `person`, `note`, `callout`, `step`, `predefined-process`, `documents`, `manual-input`, `manual-operation`, `delay` |
| `label` | node, group, frame | the text shown, when it differs from the name |
| `color` | node, frame, connection | a colour name (`blue`) or `#rrggbb` |
| `dashed` | node | dashed outline |
| `border` | node | `double` or `thick`: a second line inside the outline, or a heavier one |
| `marker` | node | a glyph inside the shape: `envelope`, `clock`, `cross`, `plus`, `circle`, `pentagon`, `asterisk`, `dot`, `bullseye` |
| `stack` | node | `true`: drawn as a stack of three (replicas, clusters) |
| `status` | node | `error`, `warning`, `success` or `info`: a colour with a meaning (stored as that colour) |
| `x`, `y`, `w`, `h` | node, frame | exact position (top-left) and size |
| `padding` | frame | space between a frame's border and its contents |
| `from`, `to` | connection | a side the line leaves / enters (`top`, `right`, `bottom`, `left`), or what that end says: a multiplicity (`1`, `0..1`, `0..*`, `2..5`) or a cardinality (`one`, `exactly-one`, `many`, `zero-or-one`, `zero-or-many`, `one-or-many`) |
| `from-end`, `to-end` | connection | the same end value, for an end that already names a side |
| `relation` | connection | what the connection means (see below); sets the line style, heads and end glyphs |
| `notation` | connection | `crows-foot` (default) or `chen`, for an `er-relationship` |
| `from-role`, `to-role` | connection | a role name written under the line at that end |

Kinds: service, database, server, api, queue, cache, storage, cdn, dns, firewall, waf, load-balancer, internet, kubernetes, pod, cluster, container, worker, service-mesh, deployment, namespace, region, availability-zone, vm, user, mobile, browser, lambda, event-bus, secrets, authentication, gateway, message-broker, ai-model, agent, tool, memory, knowledge-base, vector-store, dashboard, alerting, config, cicd, workflow, start, end, decision, parallel, retry, loop, external, generic.

Header lines (`title`, `type`, `direction`) come first. `type` is one of `architecture`, `flowchart`, `concept`, `mind-map`, `sequence`, `network`, `entity-relationship`, `workflow`, `class`, `organization`, `dependency`; a typed diagram is placed by its family's layout engine (mind-map radial, ER and class engines, sequence lifelines, BPMN). `direction` is `down`, `right`, `up` or `left` and sets the reading direction of the layout.

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

Entities are tables (`shape: entity`) with one row per column; relationships carry their cardinality as a relation, drawn with crow's-foot ends.

```diagram-code
type entity-relationship
title Library
Member [shape: entity, rows: "id int pk; name text; email text uq"]
Book [shape: entity, rows: "id int pk; title text"]
Loan [shape: entity, variant: junction, rows: "id int pk; member_id int fk -> member.id; book_id int fk -> book.id; due date"]

Member > Loan: borrows [relation: er-relationship, from: one, to: zero-or-many]
Book > Loan: lent in [relation: er-relationship, from: one, to: zero-or-many]
```

## Structured shapes

| `shape:` | Draws | Content properties |
|---|---|---|
| `entity` (`table`) | an ER table: header plus one line per column | `rows: "id int pk; team_id int fk -> teams.id"`, `variant: weak\|associative\|junction` |
| `class` | a UML class with compartments | `attributes: "-total: Money"`, `operations: "+pay(m: Method): Receipt"` (`;` between members), `variant`, `stereotype`, `template` |
| `interface`, `enum` | a UML interface, or an enumeration (literals in `attributes`) | as `class` |
| `lifeline` | a sequence participant with its lifeline; messages are connections in order | |
| `topic` (`branch`) | a mind-map topic; its role and colour follow from where it sits in the tree | |

Rectangles, semantic nodes, tables and classes have three connection points per side (25 %, 50 %, 75 %); `from`/`to` sides still name a side.

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

`cylinder`, `cloud`, `document`, `hexagon`, `parallelogram`, `queue`, `package`, `component`, `person`, `note`, `callout`, `step`, `predefined-process`, `documents`, `manual-input`, `manual-operation` and `delay` are drawn as outline shapes: one kind of element with a variant, so each is resizable, takes a label, a colour and connectors like any node. They are also in the shape picker ("More shapes…" at the end of the Shapes flyout, or "Insert shape…" in the command menu) and the properties bar's Shape control, and a board edit of the variant is written back as `shape:`.

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

Some outlines have other names that mean the same: `actor` for `person`, `chevron` for `step`, `namespace` for `package`, `module` for `component`, `subroutine` for `predefined-process`, `speech-bubble` for `callout` and `sticky` for `note`.

```diagram-code
type flowchart

Inbox [shape: queue]
Triage [shape: step]
Rules [shape: predefined-process]
Typing [shape: manual-input]
Review [shape: manual-operation]
Wait [shape: delay]
Reports [shape: documents]
Owner [shape: person]
Docs [shape: package]
Parser [shape: component]
Remark [shape: note]
Tip [shape: callout]

Inbox > Triage > Rules > Typing > Review > Wait > Reports
Owner > Review
Parser > Docs
Remark > Tip
```

## Connection meaning

A connection can say what it means: `A > B [relation: composition, from: 1, to: 0..*]` (the bracket may follow the name directly, or a label and a colon). The relation is stored on the connector as data (kind, notation and what each end says), and the line style, heads and end glyphs are derived from it, so a text label is never what carries the meaning. A connection with no `relation` is drawn exactly as before.

| Relation | Drawn as |
| --- | --- |
| `association` | plain line; multiplicity and role at each end |
| `directed-association` | open arrow at the target |
| `generalization` (inheritance) | solid line, hollow triangle at the parent (target) |
| `realization` (implements) | dashed line, hollow triangle at the interface (target) |
| `dependency` | dashed line, open arrow at the target |
| `aggregation` | hollow diamond at the whole (the source: `Whole > Part`) |
| `composition` | filled diamond at the whole (the source) |
| `er-relationship` | a glyph or a label from the cardinality at each end (below) |
| `sync-message`, `async-message`, `return-message`, `create-message`, `destroy-message` | sequence messages: filled arrow, open arrow, dashed open arrow, dashed open arrow, line ending in a cross |
| `sequence-flow`, `message-flow`, `bpmn-association` | BPMN: filled arrow; dashed with a circle at the start and a hollow arrow; dotted line |
| `assembly` | a ball at the source end and a socket at the target end |

Cardinality is a word and multiplicity is `m..n` (`*` for many); anything else, such as `many-ish` or `3..`, is reported and ignored. `notation: chen` writes `1`, `N` and `0..N` beside the line instead of crow's foot glyphs, and switching it changes no data. A relation that does not fit its ends (a `generalization` between two decisions) is reported as a warning and still drawn.

```diagram-code
type flowchart

Customer
Order
Line item
Product

Customer > Order [relation: er-relationship, from: one, to: zero-or-many]
Order > Line item [relation: composition, from: 1, to: 1..*, to-role: "lines"]
Line item > Product [relation: er-relationship, notation: chen, from: many, to: one]
```

## Borders, markers, stacks and statuses

A few pictures a plain shape cannot draw are an outline with a parameter. `border: double|thick` adds a second or a heavier line, `marker: <glyph>` draws a small symbol inside, and `stack: true` draws a stack of three. A plain `rectangle`, `diamond` or `pill` that takes `border` or `marker` is drawn as a box, a diamond or an ellipse with them; on an ordinary node `stack: true` keeps its icon and kind and only adds the copies behind it. Common combinations have their own names, which you can use instead of the parameters (and which are what code read from a board is written with):

`initial-state`, `final-state`, `identifying-relationship`, `start-event`, `intermediate-event` (also `multivalued-attribute`), `end-event`, `timer-event`, `message-event`, `exclusive-gateway`, `parallel-gateway`, `inclusive-gateway`, `event-based-gateway` and `complex-gateway`.

```diagram-code
type flowchart

Start [shape: start-event]
Wait [shape: timer-event]
Approved? [shape: exclusive-gateway]
Fan out [shape: parallel-gateway]
Done [shape: end-event]
Replicas [kind: database, stack: true]
Dead letters [kind: queue, status: error]
Custom [shape: diamond, border: double, marker: plus]

Start > Wait > Approved? > Fan out > Done
Fan out > Replicas
Approved? > Dead letters
```

A shape name the editor does not know (a typo, or one a newer version added) is reported with the list of real shapes, and the node is drawn as an ordinary rectangle node.

## Not supported

These are reported as diagnostics with a suggestion rather than silently ignored or faked:

- **Shapes** that are not in the list above (`star`, `octagon`, ...). The diagnostic names the shapes that exist, and the node is drawn as a rectangle.
- **Sequence diagrams** with lifelines and messages, **mind maps** with a radial layout, and **UML class diagrams** with member compartments. `type sequence`, `type mind-map` and `type class` only label the diagram.
- **`direction`**: parsed, no layout effect.

## Round trip

"Load" writes the canvas as code (with `x/y/w/h` and sides when positions are known). Editing and applying updates the same elements: unchanged declarations write nothing, a node you moved stays where you put it, and if you and the code changed the same field the editor asks which to keep. Known limits: resizing a node by hand is not kept by an update; renaming a node is a delete plus an add; a group whose nodes sit in different frames is left untouched on the board and not written to the code.
