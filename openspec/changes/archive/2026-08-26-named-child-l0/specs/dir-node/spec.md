## MODIFIED Requirements

### Requirement: Extractive L0 text

Unless a contract file applies, the dir-node body SHALL be extractive L0: directory path, optional path context, optional 1C xml peek, **named-child expansion** when applicable, child directory names, and child indexed-file basenames with first markdown `#` heading when present. The text SHALL NOT include LLM-invented sentences. The body SHALL be at most 500 characters. When the budget is exceeded, the system SHALL omit whole names or trailing lines and indicate overflow with `+N more`; it SHALL NOT cut a name mid-token with a character slice. After xml peek, named-child expansion lines SHALL appear before leftover direct child listings. Up to 32 leftover **direct** child dir or file names MAY be listed; that 32 SHALL NOT count names on `Ext:` / `Forms:` expansion lines.

#### Scenario: Markdown folder L0 lists children and headings

- **WHEN** extractive L0 is built for a directory of markdown files with H1 headings and no child dirs named `Ext` or `Forms`
- **THEN** the L0 contains the directory path and at least one `basename — heading` line copied from a child file, and does not contain `Ext:` or `Forms:` expansion lines

#### Scenario: Cap at 32 leftover children

- **WHEN** a directory has more than 32 direct indexed-file or child-dir names to list after expansion lines
- **THEN** L0 lists at most 32 of those leftover names and includes a `+N more` marker

#### Scenario: 500 chars drops whole names

- **WHEN** extractive L0 would exceed 500 characters
- **THEN** the stored body is at most 500 characters, ends with `+N more` or a complete name, and does not contain a mid-name `...` cut from a character slice

## ADDED Requirements

### Requirement: Named-child expansion

When a directory has a direct child directory named exactly `Ext`, extractive L0 SHALL include a line listing indexed-file basenames under that `Ext` folder (comma-separated, `Ext: …`). When it has a direct child directory named exactly `Forms`, extractive L0 SHALL include a line listing **child directory names** under that `Forms` folder (comma-separated, `Forms: …`), without peeking per-form xml. Names SHALL come from indexed file paths (same source as other extractive children), not a filesystem walk of unindexed files. Missing `Ext` or `Forms` SHALL omit that line. The system SHALL NOT expand `Commands`, `Templates`, or any other child directory name in this way.

#### Scenario: 1C object lists Ext files and Forms dirs

- **WHEN** extractive L0 is built for `conf/Documents/ЗаказПокупателя` with indexed `Ext/ManagerModule.bsl` and `Forms/ФормаДокумента/…` files
- **THEN** L0 contains `Ext: ManagerModule.bsl` (and other Ext file basenames) and `Forms: ФормаДокумента` (and other Forms directory names)

#### Scenario: Markdown tree without Ext/Forms is unchanged

- **WHEN** extractive L0 is built for `docs/ai` with no child dir named `Ext` or `Forms`
- **THEN** L0 has no `Ext:` or `Forms:` expansion line

#### Scenario: No form xml peek

- **WHEN** `Forms/ФормаДокумента.xml` exists beside a form directory
- **THEN** the `Forms:` line uses the directory name only (does not require `Name` / ru `Synonym` from that xml)
