# Lesson content contract (Milestone 2)

Every lesson has one body file at `content/lessons/<lessonId>.json`.
The body is rendered by the lesson engine and scored by the assessment runner.
Files are validated by `npm test`, by `npm run verify` and by the authoring CLI:

```bash
node tests/validate-lesson.mjs content/lessons/a1-m1-l1.json
npm run validate:lesson content/lessons
```

## Non-negotiable structure

- `id` must equal the lesson id in `content/<level>/course.json`.
- `version` must be `1`.
- `sections` must contain **exactly 17 sections in this order**:

| # | `type` | Purpose |
| --- | --- | --- |
| 1 | `warmup` | Speaking warm-up, no scoring |
| 2 | `objectives` | Rendered from the curriculum objectives |
| 3 | `explanation` | The concept in plain English with German examples |
| 4 | `rules` | Patterns, tables and memory hooks |
| 5 | `vocabulary` | 4–6 words with article, plural, example |
| 6 | `examples` | 3–5 model sentences with translations |
| 7 | `pronunciation` | 3–5 sounds/words with an articulation hint |
| 8 | `culture` | A short, accurate cultural or usage note |
| 9 | `dialogue` | 4–8 turns of natural German with English |
| 10 | `grammar` | A focused grammar table or rule set |
| 11 | `mcq` | 4–6 multiple-choice exercises |
| 12 | `gap` | 4–6 gap-fill exercises |
| 13 | `order` | 3–5 sentence-building exercises |
| 14 | `listening` | 3–6 line script plus 2–3 questions |
| 15 | `speaking` | A spoken task, model answer and tips |
| 16 | `mistakes` | 3–4 wrong/right pairs with an explanation |
| 17 | `assessment` | 10 or 12 scored questions (matching the curriculum metadata), mixed types |

Section `id` should equal the type. Every section needs `type`, `title` and a
positive `minutes` value; `lede` is optional one-sentence framing.

## Content quality rules

1. **Teach, do not advertise.** No placeholders, “coming soon”, lorem ipsum,
   milestone references or duplicate filler.
2. **CEFR appropriate.** A1 uses short main clauses and high-frequency words;
   C2 may use nominalisation, passive, Konjunktiv II and abstract vocabulary.
3. **German must be correct.** Check articles, plurals, verb position,
   separability, case and umlauts. Use Swiss spelling only when explicitly
   discussing Swiss usage.
4. **English is a support, not a translation crutch.** Explanations are in
   English; examples carry a natural English translation.
5. **Assessment must be answerable from the lesson.** Ten or twelve questions
   (matching the curriculum metadata), at least two question types, one clearly
   correct option, and an explanation for every question.
6. **No unsafe or invented facts.** Cultural notes should be broadly true and
   non-stereotyped.
7. **Keep it compact.** A lesson body is normally 9–15 KB.

## Section fields

### Shared

```json
{ "id": "warmup", "type": "warmup", "title": "Warm-up", "minutes": 2, "lede": "Optional." }
```

### `warmup`

```json
{
  "prompt": "Read these aloud.",
  "items": ["Hallo!", "Wie geht es dir?"]
}
```

### `objectives`

Only the shared fields. The engine reads the curriculum objectives and key phrase.

### `explanation`, `rules`, `culture`, `grammar`

`culture` and `grammar` also require `heading`; `grammar` may add `tip`.

```json
{
  "blocks": [
    { "kind": "p", "text": "A paragraph." },
    { "kind": "list", "items": ["Point one.", "Point two."] },
    { "kind": "table", "headers": ["German", "English"], "rows": [["Haus", "house"]] },
    { "kind": "note", "title": "Careful", "text": "A warning." },
    { "kind": "de", "text": "Ich bin müde.", "en": "I am tired." }
  ]
}
```

### `vocabulary`

```json
{
  "items": [
    {
      "de": "der Apfel",
      "en": "the apple",
      "article": "der",
      "plural": "die Äpfel",
      "pronunciation": "ˈapfl̩",
      "example": "Der Apfel ist rot.",
      "exampleEn": "The apple is red."
    }
  ]
}
```

`article` is only for nouns. Omit `plural` for verbs/adjectives. Minimum four items.

### `examples`

```json
{ "items": [{ "de": "Ich wohne in Berlin.", "en": "I live in Berlin.", "note": "Optional." }] }
```

### `pronunciation`

```json
{ "items": [{ "de": "ich", "hint": "Soft ch, air escapes.", "en": "I" }] }
```

### `dialogue`

```json
{
  "setting": "At the bakery",
  "lines": [{ "speaker": "Kunde", "de": "Guten Morgen.", "en": "Good morning." }]
}
```

### Exercise sections `mcq`, `gap`, `order`

```json
{
  "exercises": [
    {
      "id": "l1-p1",
      "type": "mcq",
      "prompt": "Which word means “house”?",
      "options": ["Haus", "Hund", "Hand", "Hof"],
      "answer": 0,
      "explanation": "das Haus = the house."
    },
    {
      "id": "l1-g1",
      "type": "gap",
      "prompt": "Ich ___ aus Indien.",
      "answers": ["komme"],
      "explanation": "ich komme = I come."
    },
    {
      "id": "l1-o1",
      "type": "order",
      "prompt": "Build: “I live in Berlin.”",
      "tokens": ["Berlin", "wohne", "Ich", "in"],
      "answer": "Ich wohne in Berlin.",
      "explanation": "The verb is in second position."
    }
  ]
}
```

- Exercise/question ids are unique across the whole lesson.
- `answer` in an MCQ is a zero-based option index.
- `gap.prompt` must contain `___`.
- Gap answers are compared case-insensitively after trimming and collapsing spaces.
- For `order`, `tokens` must be supplied in a scrambled order. They must contain
  exactly the same words as `answer` (same count, including repeated words such as
  `ein … ein` or `die … die … die … die`), because the UI can only build the
  answer from the supplied tokens. Answers accept the exact token sequence,
  ignoring case, punctuation and extra spaces.

### `listening`

```json
{
  "speaker": "Two colleagues",
  "script": [{ "speaker": "Nina", "de": "Hallo!", "en": "Hello!" }],
  "questions": [ { "id": "l1-lq1", "type": "mcq", "prompt": "…", "options": ["…"], "answer": 0, "explanation": "…" } ]
}
```

The engine reads the script with German speech synthesis, allows transcript
reveal and slow playback, and scores the questions like practice exercises.

### `speaking`

```json
{
  "prompt": "Introduce yourself in three sentences.",
  "model": { "de": "Ich heiße …", "en": "My name is …" },
  "tips": ["Speak slowly.", "Record and compare."]
}
```

Speech capture is **not** part of Milestone 2. The task is self-assessed with a
checklist; no invented pronunciation score is shown.

### `mistakes`

```json
{ "items": [{ "wrong": "Ich bin 20 Jahre.", "right": "Ich bin 20 Jahre alt.", "why": "alt is required." }] }
```

### `assessment`

`passScore` must match `lesson.assessment.passScore` in the curriculum, and the
number of questions must match `lesson.assessment.questions`. Use the same
question objects as the practice sections. Mix at least two question types.
