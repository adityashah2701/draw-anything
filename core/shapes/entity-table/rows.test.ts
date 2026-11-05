import { describe, expect, it } from "vitest";
import { parseRows, writeRows } from "./rows";

describe("entity rows", () => {
  it("reads the canonical form and writes it back", () => {
    const text = "id int pk; team_id int -> teams.id; note text nullable";
    expect(writeRows(parseRows(text))).toBe(text);
  });

  it("reads commas and newlines as separators, but not a comma inside a type", () => {
    expect(parseRows("id int pk, price numeric(10,2)\nname text").map((r) => [r.name, r.type])).toEqual([["id", "int"], ["price", "numeric(10,2)"], ["name", "text"]]);
  });

  it("reads SQL-style keys and constraint lines instead of turning them into columns", () => {
    const rows = parseRows("book_id int; author_id int; email text unique not null; primary key (book_id, author_id); foreign key (book_id) references books(id); owner int references users(id)");
    expect(rows.map((r) => r.name)).toEqual(["book_id", "author_id", "email", "owner"]);
    expect(rows[0]).toMatchObject({ keys: ["pk", "fk"], references: "books.id" });
    expect(rows[1].keys).toEqual(["pk"]);
    expect(rows[2]).toMatchObject({ keys: ["uq"], type: "text" });
    expect(rows[3]).toMatchObject({ keys: ["fk"], references: "users.id", type: "int" });
  });
});
