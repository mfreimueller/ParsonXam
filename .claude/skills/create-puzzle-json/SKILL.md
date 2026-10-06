---
name: create-puzzle-json
description: Creates a JSON file of Parsons puzzles (title, task description, solution lines, red herrings) that a teacher can import into a ParsonXam exam. Use when asked to write, generate or convert puzzles for ParsonXam.
---

# Create a ParsonXam puzzle JSON

A teacher imports the file on the exam page: **Puzzles → Import from JSON**. The puzzles are appended after the existing ones. The import is all-or-nothing, so one invalid puzzle rejects the whole file.

## Format

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

## How to write good puzzles

1. Pick one concept per puzzle (a loop, a function, a conditional, ...), 4 to 10 solution lines. Put the goal and, if useful, an example input and output in `description`.
2. The solution must be one definite order. Scoring is exact-position: a line is correct only at its own slot. Avoid solutions where two neighbouring lines could be swapped without changing behaviour (e.g. two independent initialisations), or the student gets marked wrong for a valid answer. Reorder or rewrite so only one order works.
3. Identical lines are allowed in the solution (e.g. two `pass` lines), but avoid them where order would be ambiguous.
4. Red herrings are plausible mistakes, not noise: an off-by-one range, a wrong operator, a missing colon variant, a misspelled variable that looks right at a glance. A red herring must be wrong in every position: it must never be a valid line for the solution. 0 to 3 per puzzle is typical.
5. Indentation is part of the answer only when the teacher turns on "students set the indentation". Always set `indent` correctly regardless.
6. Match the language the teacher uses (ask if unclear; default Python). Keep indentation by `indent`, never by spaces in `code`.

## Procedure

1. Ask for or infer: topic, language, number of puzzles, difficulty, whether red herrings are wanted.
2. Write the JSON to a `.json` file, UTF-8, with the structure above.
3. Validate it: `node .claude/skills/create-puzzle-json/validate.mjs <file.json>`. Fix every reported problem and rerun until it prints `OK`.
4. Mentally run each solution once to check that it actually does what `description` says.
5. Tell the teacher the file path and how to import it (exam page, Puzzles, Import from JSON).
