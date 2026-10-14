# Puzzle import file

A teacher imports puzzles on the exam page (**Puzzles → Import from JSON**; API: `POST /exams/:examId/puzzles/import`). The puzzles are appended after the existing ones. The import is all-or-nothing: one invalid puzzle rejects the whole file. Do not put `id` fields in the file; ids are generated.

The authoritative rules live in `backend/src/routes/puzzles.ts` (schemas) and `backend/src/lib/template.ts` (template parser). The skill `.claude/skills/create-puzzle-json/` has a validator (`validate.mjs`) that mirrors them.

## File shape

```json
{ "puzzles": [ { "...": "puzzle" }, { "...": "puzzle" } ] }
```

`puzzles` has 1 to 50 entries. The top level must be an object with this key. A puzzle is either a **line puzzle** (`kind` `"lines"`, or no `kind` at all) or a **template puzzle** (`kind` `"template"`). Both kinds may be mixed in one file. Common fields:

| Field | Rules |
|---|---|
| `title` | Required, trimmed, 1 to 120 characters. |
| `description` | Task text, trimmed, max 2000 characters, default `""`. |

## Kind `lines`

```json
{
  "kind": "lines",
  "title": "Sum of 1 to N",
  "description": "Read n and print 1 + 2 + ... + n.",
  "solution": [
    { "code": "n = int(input())", "indent": 0 },
    { "code": "print(n)", "indent": 0 }
  ],
  "redHerrings": [{ "code": "for i in range(n):", "indent": 0 }]
}
```

| Field | Rules |
|---|---|
| `solution` | Lines in the correct order, max 30 (an exam needs at least 2 to be published). |
| `redHerrings` | Lines that belong in no solution, max 10, default `[]`. |
| line `code` | Single line, 1 to 200 characters after trailing spaces are dropped, no leading spaces or tabs (use `indent`). |
| line `indent` | Integer 0 to 6 (nesting levels, not spaces), default 0. |

## Kind `template`

```json
{
  "kind": "template",
  "title": "Employees above their department average",
  "description": "...",
  "template": "{{SELECT}} {{e.name}}\n{{FROM}} {{employees e}}\n...",
  "redHerrings": ["GROUP BY", "HAVING"],
  "reusable": ["SELECT", "FROM", "WHERE"]
}
```

| Field | Rules |
|---|---|
| `template` | Required string, the real solution code with `{{...}}` markers, see below. Max 6000 characters and 80 lines. Lines are separated by `\n` (or `\r\n`). |
| `redHerrings` | Strings that are extra, wrong pool pieces. Max 15, default `[]`. Each is whitespace-normalised, must not be empty and is max 200 characters. |
| `reusable` | Piece texts that can be placed any number of times. Default `[]`. Each (after normalisation) must occur in the template pieces or in `redHerrings`; duplicates are ignored. |

The API additionally rejects absurdly large input before parsing: `template` over 20000 characters, more than 100 red herrings or 200 reusable entries, or any such string over 1000 characters.

Other limits (the parser reports them with a 1-based line number): at most 30 gaps, at most 60 solution pieces, each piece at most 200 characters.

### Template syntax

Everything outside markers is **fixed text**, shown to the student as given code. Marked pieces are removed from the code and become drop **gaps**; the pieces go into the student's pool.

- `{{text}}` marks one piece. The text is trimmed and must not be empty, except for the empty marker below.
- A **gap** is a maximal run of markers on one line separated only by spaces or tabs: `{{@Id}} {{@GeneratedValue}}` is one gap holding two pieces in order. Fixed text between markers (even `,`) ends the gap and starts a new one. A line can hold several gaps, or none (pure context).
- `{{}}` (exactly, no blanks inside) is an **empty gap**: the correct answer is to leave it empty. Use it as a decoy so the visible gaps do not give away where pieces go. It must stand alone, not in a run with other markers.
- `{{~text}}` as the **first** marker of a gap makes it an **any-order gap**: its pieces are scored as a set, in any order (the `~` is not part of the text). Only the first marker of a gap may start with `~`; `{{~}}` is invalid.
- Escapes: `\{{` is a literal `{{` in fixed text. Inside a marker, `\}}` is a literal `}}` and a leading `\~` is a literal `~`.
- Leading whitespace of a line is fixed text (tabs there become 4 spaces; tabs elsewhere stay as they are). Trailing whitespace is dropped. Blank lines are fine.
- Piece texts are compared after collapsing whitespace runs to one space and trimming.
- Pool: a text listed in `reusable` is one tile (with an infinity badge) no matter how often it occurs. Any other text that occurs twice in the solution (two `)`) gives two tiles. Red herrings are added as further tiles.

Error messages name the line, e.g. `line 3: Only the first marker of a gap may start with “~”.`

### Scoring

For every gap with expected pieces `E` and placed pieces `P` (compared by text):

- `match` = length of the longest common subsequence of `E` and `P`; for an any-order gap, the size of the multiset intersection.
- `denom` = `max(|E|, |P|)`.

Puzzle % = `Σ match / Σ denom × 100`. Missing pieces, extra pieces, red herrings and anything placed in an empty gap lower the score; a puzzle with nothing placed scores 0. The exam score is the mean of the puzzle percentages. In the review, a placed piece counts as correct if it is part of the common subsequence (any-order: of the intersection).

Gaps are scored independently, so a correct piece in the wrong gap earns nothing for either gap.

## Notes on differences between SPEC and code

- A red herring that equals a solution piece is not rejected by the backend (the same holds for line puzzles; the skill validator rejects that for lines and only warns for templates). Such a duplicate is a poor decoy because it may be a valid piece.
- Besides the parser limits, the API has coarse pre-limits (see above) not mentioned in `SPEC.md`.
