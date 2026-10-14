---
name: create-puzzle-json
description: Creates a JSON file of Parsons puzzles (line puzzles, or template puzzles with gaps for annotations, SQL, REST, config) that a teacher can import into a ParsonXam exam. Use when asked to write, generate or convert puzzles for ParsonXam.
---

# Create a ParsonXam puzzle JSON

A teacher imports the file on the exam page: **Puzzles → Import from JSON**. The puzzles are appended after the existing ones. The import is all-or-nothing, so one invalid puzzle rejects the whole file.

## Two kinds of puzzle

- **Line puzzle** (`kind` `"lines"` or omitted): the student orders whole lines. Best for algorithms in Python, Java and so on, where order of statements matters.
- **Template puzzle** (`kind` `"template"`): the real code is given with gaps; the student drops small pieces into the gaps. Best for annotations/JPA mappings, REST controllers, SQL, config files (YAML, JSON, HTML): several pieces per line, a lot of fixed context code, little about ordering lines.

Choose a template when a line holds several meaningful pieces or when most code is boilerplate; choose lines when the point is the sequence of statements. A file may mix both. Full reference: `docs/puzzle-import.md`.

## Format: line puzzles

```json
{
  "puzzles": [
    {
      "title": "Sum of 1 to N",
      "description": "Read n and print 1 + 2 + ... + n.",
      "solution": [
        { "code": "n = int(input())", "indent": 0 },
        { "code": "total = 0", "indent": 0 },
        { "code": "for i in range(1, n + 1):", "indent": 0 },
        { "code": "total += i", "indent": 1 },
        { "code": "print(total)", "indent": 0 }
      ],
      "redHerrings": [
        { "code": "for i in range(n):", "indent": 0 }
      ]
    }
  ]
}
```

| Field | Rules |
|---|---|
| `puzzles` | 1 to 50 puzzles. The top level must be an object with this key, not a bare puzzle or array. |
| `title` | Required, max 120 characters. |
| `description` | The task text students read. Max 2000 characters, may be `""`. |
| `solution` | Lines **in the correct order**, max 30. At least 2 are needed before the exam can be published. |
| `redHerrings` | Lines that do not belong in any correct solution, max 10. Optional (`[]`). Order does not matter. |
| line `code` | One line, max 200 characters, no line breaks, **no leading spaces or tabs** (use `indent`). Trailing spaces are dropped. |
| line `indent` | Integer 0 to 6, nesting level (one level = one indent step, not a number of spaces). Default 0. |

Do not add `id` fields; ids are generated on import.

## Format: template puzzles

```json
{
  "puzzles": [
    {
      "kind": "template",
      "title": "Employees above their department average",
      "description": "List name and salary of every employee earning more than their department's average.",
      "template": "{{SELECT}} {{e.name}}, {{e.salary}}\n{{FROM}} {{employees e}}\n{{WHERE}} {{e.salary > (}}\n    {{SELECT}} {{AVG(x.salary)}}\n    {{FROM}} {{employees x}}\n    {{WHERE}} {{x.dept_id = e.dept_id}}\n{{)}}",
      "redHerrings": ["GROUP BY", "HAVING"],
      "reusable": ["SELECT", "FROM", "WHERE"]
    }
  ]
}
```

| Field | Rules |
|---|---|
| `kind` | `"template"`. |
| `title`, `description` | As for line puzzles. |
| `template` | The complete correct code with markers, max 6000 characters, 80 lines, 30 gaps, 60 pieces, 200 characters per piece. Newlines as `\n` in the JSON string. |
| `redHerrings` | Strings (not objects): wrong extra pieces, max 15, each non-empty, max 200 characters. Optional. |
| `reusable` | Strings that may be placed any number of times. Each must occur in the template pieces or in `redHerrings`. Optional. |

### Template syntax

- `{{text}}` turns `text` into a piece the student must place; everything else is fixed code the student sees.
- A **gap** is a run of markers on one line separated only by blanks: `{{@Id}} {{@GeneratedValue}}` is one gap with two pieces in order. Any fixed text between markers (even `,`) ends the gap.
- `{{}}` (nothing inside) is an **empty gap**, a decoy: the right answer is to put nothing there. It must stand alone, never next to another marker.
- `{{~text}}` as the first marker of a gap makes it **any order**: `{{~@Id}} {{@GeneratedValue}}` accepts the two annotations in either order. Only the first marker of a gap may carry `~`; `{{~}}` is invalid.
- Escapes: `\{{` is a literal `{{`; inside a marker `\}}` is a literal `}}` and a leading `\~` a literal `~`. In JSON write each backslash twice.
- Leading indentation is fixed text (tabs become 4 spaces), trailing blanks are dropped, inner whitespace of a piece is collapsed to one space. Do not indent with `indent` fields: there are none.

### Scoring in short

Each gap is scored on its own: matching pieces (longest common subsequence, or set intersection for any-order gaps) divided by the larger of expected and placed count; the puzzle percentage is the sum over all gaps. Missing, extra, wrongly placed pieces, red herrings and anything in an empty gap cost points.

### How to write good template puzzles

1. Write the real, working code first, then mark pieces. 3 to 12 gaps is typical; keep most of the code fixed so the student has context.
2. **Granularity**: a piece is a meaningful unit (an annotation, a keyword, a clause, a path, an attribute), not single characters or whole statements. Never split a token (`Gen`+`erationType`). Pieces with the same text but different roles still work, but avoid very short ambiguous ones such as `)` many times.
3. **Separate gaps by fixed text**. Pieces that always belong together in a fixed order sit in one gap run; if order does not matter use `~`.
4. **Any-order gaps** for order-insensitive things: Java annotations on one element, columns in a SELECT list, CSS properties, YAML keys. The `~` goes on the first marker of that run. If order matters (SQL clause order, code), use no `~`.
5. **Reusable** for keywords that occur several times (SELECT/FROM/WHERE in subqueries, `return`, `private`): list the text once in `reusable`; it appears once in the pool with an infinity badge. Non-reusable repeated pieces appear once per occurrence.
6. **Decoy empty gaps** (`{{}}`) where nothing belongs, for example between two fields where an annotation could go. Use a few, not in every spot.
7. **Red herrings** are plausible but wrong here: `@ManyToOne` instead of `@OneToMany`, `HAVING` instead of `WHERE`, wrong HTTP verb annotation. Not a piece that is also valid in the solution. 2 to 4 per puzzle is typical.
8. Make sure the solution is the only sensible answer: if two pieces could swap between different gaps, the student is marked down for a valid answer. Make the description say what is required.

## How to write good puzzles (line puzzles)

1. Pick one concept per puzzle (a loop, a function, a conditional, ...), 4 to 10 solution lines. Put the goal and, if useful, an example input and output in `description`.
2. The solution must be one definite order. Scoring is exact-position: a line is correct only at its own slot. Avoid solutions where two neighbouring lines could be swapped without changing behaviour (e.g. two independent initialisations), or the student gets marked wrong for a valid answer. Reorder or rewrite so only one order works.
3. Identical lines are allowed in the solution (e.g. two `pass` lines), but avoid them where order would be ambiguous.
4. Red herrings are plausible mistakes, not noise: an off-by-one range, a wrong operator, a missing colon variant, a misspelled variable that looks right at a glance. A red herring must be wrong in every position: it must never be a valid line for the solution. 0 to 3 per puzzle is typical.
5. Indentation is part of the answer only when the teacher turns on "students set the indentation". Always set `indent` correctly regardless.
6. Match the language the teacher uses (ask if unclear; default Python). Keep indentation by `indent`, never by spaces in `code`.

## Procedure

1. Ask for or infer: topic, language, number of puzzles, difficulty, whether red herrings are wanted.
2. Write the JSON to a `.json` file, UTF-8, with the structure above. `example.json` next to this file has one line puzzle and two template puzzles (SQL with reusable keywords, JPA with any-order and empty gaps).
3. Validate it: `node .claude/skills/create-puzzle-json/validate.mjs <file.json>`. Fix every reported problem and rerun until it prints `OK` (warnings are advice, not errors). The validator applies the same rules as the server.
4. Mentally run each solution once to check that it actually does what `description` says.
5. Tell the teacher the file path and how to import it (exam page, Puzzles, Import from JSON).
