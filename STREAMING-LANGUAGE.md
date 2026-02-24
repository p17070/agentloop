# A Streamable Programming Language

JSON needs the closing `}` before you can parse it. JSONL you can parse line by line as it arrives. Most programming languages are like JSON — you need the full program (or at least full blocks) before you can parse or execute anything. What if a language was like JSONL — each line parseable and executable the moment it arrives?

This matters because LLMs emit code token by token. Today you wait for the full response, then parse it, then run it. A streamable language could **execute as the LLM types**.

---

## The Problem

Python:

```python
def calculate(expr):
    tokens = tokenize(expr)     # can't run anything yet
    ast = parse(tokens)         # still waiting...
    return evaluate(ast)        # still waiting...

result = calculate("2 + 3")    # NOW you can run it, but only if
print(result)                   # all 5 lines have arrived
```

You need the closing of `def` before `calculate` exists. You need `calculate` to exist before you can call it. The parser needs the `)` and `:` before it knows the function signature is complete. Everything depends on everything else.

JSON has the same problem:

```json
{
  "buttons": [
    {"label": "Add", "op": "+"
```

Is this valid? You can't tell. You need `}`, `]`, `}` to close it. The parser is in a "waiting for more" state. If the LLM stops here, you have nothing.

JSONL doesn't have this problem:

```jsonl
{"type":"button","label":"Add","op":"+"}
{"type":"button","label":"Sub","op":"-"}
{"type":"button","label":"Mul","op":"*"}
```

Line 1 arrives → you have a button. Line 2 arrives → you have two buttons. Every prefix ending at a newline is valid and usable.

---

## The Idea: Code That Works Like JSONL

A language where **every line is independently parseable and immediately executable**. No waiting for closing braces. No forward references. No multi-line constructs that hold everything hostage.

### Calculator in a streamable language:

```
title "Calculator"
display result = 0

button "7" -> result = append(result, 7)
button "8" -> result = append(result, 8)
button "9" -> result = append(result, 9)
button "+" -> op = add
button "4" -> result = append(result, 4)
button "5" -> result = append(result, 5)
button "6" -> result = append(result, 6)
button "-" -> op = sub
button "1" -> result = append(result, 1)
button "2" -> result = append(result, 2)
button "3" -> result = append(result, 3)
button "*" -> op = mul
button "0" -> result = append(result, 0)
button "." -> result = append(result, ".")
button "=" -> result = apply(op, memory, result); memory = result
button "/" -> op = div
button "C" -> result = 0; memory = 0; op = none

layout grid(4, 4)
style theme("dark")
```

What the LLM has emitted after 3 lines:

```
title "Calculator"
display result = 0
button "7" -> result = append(result, 7)
```

**This is already a working app.** A window titled "Calculator" with a display showing 0 and a single button "7" that appends 7 to the display. You can render it. You can interact with it. Every subsequent line adds to it — a new button, a layout hint, a style — but at no point are you waiting for something to "close."

Compare to the same thing in React:

```jsx
function Calculator() {        // can't render yet
  const [result, setResult] = useState(0)  // still waiting
  return (                     // still waiting
    <div>                      // still waiting
      <Display value={result} />  // still waiting
      <Button label="7" onClick={() => ...} />  // STILL waiting
      ...
    </div>                     // need this
  )                            // and this
}                              // and this, THEN you can render
```

You need the entire function body, every closing paren, every closing tag. The parser holds everything in a "pending" state until the final `}`.

---

## Design Principles

### 1. Every line is a complete statement

No multi-line constructs. Nothing that starts on line N and ends on line M.

```
// NOT this (statement spans 3 lines):
if battery < 20%
  show warning
  dim screen

// THIS (each line is self-contained):
show warning when battery < 20%
dim screen when battery < 20%
```

Yes, you repeat the condition. That's the tradeoff — like JSONL repeats keys in every record. Redundancy is the price of streamability.

### 2. No closing delimiters

No `}`, `end`, `</div>`, `)`. You never wait for a closer.

```
// NOT this:
group "Scientific" {
  button "sin" -> ...
  button "cos" -> ...
  button "tan" -> ...
}

// THIS:
button "sin" -> ... [group: scientific]
button "cos" -> ... [group: scientific]
button "tan" -> ... [group: scientific]
```

The grouping is an annotation on each line, not a wrapper around lines. Any line can be parsed without knowing what comes before or after.

### 3. No forward references

Everything referenced must already exist (already been emitted).

```
// NOT this (references "add" before it's defined):
button "+" -> op = add
fn add(a, b) = a + b

// THIS (define, then use):
fn add(a, b) = a + b
button "+" -> op = add
```

This is natural for LLM output anyway — an LLM generates top-to-bottom, so definitions before usage is the natural order.

### 4. Additive only

Each line either **creates** something new or **modifies** something that already exists. The program accumulates. It's append-only, like a log.

```
// Line 1: creates a display
display result = 0

// Line 2: creates a button — the app now has a display + 1 button
button "7" -> result = append(result, 7)

// Line 3: another button — now display + 2 buttons
button "8" -> result = append(result, 8)

// Line 10: modifies existing thing
style display: font("monospace"), size(24)

// Line 11: adds behavior to something existing
on error: display show "ERR"
```

At every line boundary, you have a valid, renderable, runnable program. It might be incomplete, but it's not broken.

---

## What the LLM Stream Looks Like

The LLM is generating a calculator. From the consumer's perspective:

```
t=0   title "Calculator"                              → render: empty window with title
t=1   display result = 0                              → render: window with display showing "0"
t=2   button "7" -> result = append(result, 7)        → render: display + one button
t=3   button "8" -> result = append(result, 8)        → render: display + two buttons
...
t=18  button "C" -> result = 0; memory = 0            → render: full keypad
t=19  layout grid(4, 5)                               → re-render: arrange in grid
t=20  style theme("dark")                             → re-render: apply dark theme
```

The user sees the calculator assembling itself in real-time as the LLM generates it. Not "spinner... spinner... spinner... here's your calculator." Instead, the UI materializes piece by piece. The display appears, then buttons start populating, then they snap into a grid, then the theme applies.

**This is only possible because every prefix of the program is a valid program.**

---

## Another Example: Todo App

```
title "Todos"
input task = "" placeholder("What needs to be done?")
list todos = []
button "Add" -> todos = push(todos, task); task = ""
template todo(item) -> checkbox item.text [strike when item.done]
on enter in task: click "Add"
filter buttons("All", "Active", "Completed") -> view
show todos filtered by view
counter "{count(todos, active)} items left"
style theme("minimal")
```

After line 1: a titled window.
After line 2: a window with an input field.
After line 3: invisible (internal state), but the app is valid.
After line 4: input + an "Add" button that works.
After line 5: items render with checkboxes.
And so on.

---

## The JSONL Analogy, Precisely

| | JSON | JSONL | Traditional Language | Streamable Language |
|---|---|---|---|---|
| **Unit** | Whole document | Single line | Whole block/function/file | Single line |
| **Delimiter** | `{}`, `[]` | `\n` | `{}`, `()`, indent | `\n` |
| **Parseable prefix?** | No | Yes | No | Yes |
| **Usable incrementally?** | No | Yes | No | Yes |
| **Redundancy** | Low (keys once) | High (keys every line) | Low (define once) | High (annotations repeated) |
| **When can you act?** | After last `}` | After each `\n` | After block closes | After each `\n` |

The tradeoff is the same: **streamability costs redundancy.** JSONL repeats field names in every line. A streamable language repeats conditions, group names, type annotations on every line. But the payoff is the same too: you can start consuming immediately, you don't need the whole thing, and partial output is valid output.

---

## Why This Matters for LLMs

LLMs generate token by token. A streamable language means:

1. **Live preview** — the user sees the app building itself as the LLM generates, not a loading spinner followed by a finished product.

2. **Early termination** — if the user sees the LLM going in the wrong direction after 5 lines, they can stop it. They already have a working (partial) program from those 5 lines.

3. **Incremental validation** — each line can be type-checked, linted, and tested as it arrives. You don't wait for the full program to discover a syntax error on line 3.

4. **Resumability** — if the LLM's context window runs out mid-program, whatever it's emitted so far is a valid program. The user (or another LLM call) can continue appending lines.

5. **Diffing** — changing one feature means changing/adding/removing specific lines, not restructuring nested blocks. Like how editing a JSONL file means editing specific lines, not rebalancing brackets.

This isn't a new paradigm. It's a syntax design philosophy: **design for incremental consumption.** The same way JSONL isn't a new data model — it's JSON, designed to be consumed line by line.
