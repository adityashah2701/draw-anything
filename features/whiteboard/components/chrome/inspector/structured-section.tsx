import type { WhiteboardPageController } from "@/features/whiteboard/hooks/controller/use-whiteboard-page-controller";
import { FieldLabel, Section, TextCommitField } from "./inspector-controls";

interface StructuredSectionProps {
  structured: NonNullable<WhiteboardPageController["structured"]>;
}

export const StructuredSection = ({ structured }: StructuredSectionProps) => {
  return (
    <Section title={structured.fields.title}>
      <FieldLabel>Name</FieldLabel>
      <TextCommitField
        label="Name"
        value={structured.fields.name}
        maxLength={120}
        disabled={!structured.editable}
        onCommit={(t) => structured.set("name", t)}
      />
      {structured.fields.rows !== undefined && (
        <>
          <FieldLabel>Fields: one per line (name type pk fk uq nullable, then -&gt; table.col). Shift+Enter = new line; click away to save.</FieldLabel>
          <TextCommitField
            label="Fields"
            rows={5}
            value={structured.fields.rows}
            multiline
            maxLength={4000}
            disabled={!structured.editable}
            placeholder={"id int pk\nemail text uq"}
            onCommit={(t) => structured.set("rows", t)}
          />
        </>
      )}
      {structured.fields.attributes !== undefined && (
        <>
          <FieldLabel>Attributes: one per line (-id: int)</FieldLabel>
          <TextCommitField
            label="Attributes"
            rows={5}
            value={structured.fields.attributes}
            multiline
            maxLength={4000}
            disabled={!structured.editable}
            onCommit={(t) => structured.set("attributes", t)}
          />
          <FieldLabel>Operations: one per line (+run(): void)</FieldLabel>
          <TextCommitField
            label="Operations"
            rows={5}
            value={structured.fields.operations ?? ""}
            multiline
            maxLength={4000}
            disabled={!structured.editable}
            onCommit={(t) => structured.set("operations", t)}
          />
        </>
      )}
    </Section>
  );
};
