# Streaming as a Programming Paradigm

Not "a language that handles streams." A language whose paradigm IS streaming — where the fundamental computational act is token emission, the way functional programming's fundamental act is expression evaluation and procedural programming's is statement execution.

---

## The Paradigm Table

Every programming paradigm is defined by what computation *is* in that world:

| | Procedural | Functional | Logic | **Streaming** |
|---|---|---|---|---|
| **Primitive** | Statement | Expression | Relation | **Emission** |
| **Composition** | Sequencing (`;`) | Application (`f(x)`) | Unification | **Conditioning** |
| **State** | Mutable variables | Immutable bindings | Substitution set | **Context (all prior emissions)** |
| **Abstraction** | Procedure | Function | Rule | **Pattern** |
| **Types** | Data descriptions | Type algebra | Terms | **Grammars** |
| **Execution** | Run statements | Reduce expressions | Search proof tree | **Generate tokens** |
| **Non-determinism** | Exception | Avoided | Fundamental | **Fundamental** |
| **Result** | Side effects + return value | A value | A proof | **The emission itself** |

Streaming isn't a feature bolted onto another paradigm. It's a paradigm where **the program IS the output being generated**. Execution doesn't produce a result — execution IS the progressive emission of the result, token by token.

---

## The Core Idea: Programs Are Output

In HTML, the document IS the program. In a streaming language, the same is true, except the document is being written autoregressively — with the programmer specifying structure and constraints, and a generative process filling in the rest.

```
Dear {gen name /[A-Z][a-z]+/},

Your application for {gen role enum("Engineer", "Designer", "PM")}
has been {gen decision enum("accepted", "rejected")}.

{match decision
  "accepted" =>
    We were impressed by your {gen quality ~15 tokens}.
    Your start date is {gen date /\d{4}-\d{2}-\d{2}/}.

  "rejected" =>
    Unfortunately, {gen reason ~30 tokens}.
    We encourage you to {gen encouragement ~20 tokens}.
}

Best regards,
{gen sender /[A-Z][a-z]+ [A-Z][a-z]+/}
```

This is a complete program. Running it produces a letter. The literal text emits directly. Each `gen` block is filled by the LLM, constrained by its annotation. The `match` branches based on a previously *generated* value. Everything generated so far is the context for everything that follows.

There is no data source. There are no variables being looked up. The "data" is generated, and it conditions everything downstream. The program specifies the **structure** of generation, not the **content**.

This is not a template engine. A template has a fixed structure with holes for data. Here, **the structure itself can be generated**:

```
{gen title ~10 tokens}

{for i in 1..{gen n int(3..8)}
  Section {i}: {gen heading ~5 tokens}
  {gen body ~100 tokens}
}
```

The loop bound `n` is generated. The number of sections is decided by the LLM, not the programmer. The program's control flow depends on generated values — the skeleton is fluid, not fixed.

---

## The Six Primitives

### 1. Literal Emission

Text outside any block is emitted directly into the stream. It's simultaneously output AND context for all subsequent generation.

```
The sky is blue.
```

This isn't a string literal assigned to a variable. It's an emission — these tokens flow into the output stream and become part of the context window.

### 2. Generation (`gen`)

The fundamental operation. A hole in the stream, filled by the LLM, constrained by a grammar.

```
{gen weather enum("sunny", "rainy", "cloudy")}
{gen temperature int(0..50)}
{gen description ~20 tokens}
{gen poem /[a-z ]+\n[a-z ]+\n[a-z ]+/}
```

`gen` doesn't return a value. It emits tokens into the stream. The emitted tokens become context for all subsequent generation. The constraint (enum, int range, token count, regex) restricts the LLM's vocabulary at each position — this is constrained decoding, but elevated to a language primitive.

A bare `gen` with no constraint is unconstrained generation — the LLM emits freely until the next literal or structural boundary:

```
Once upon a time, {gen}
The end.
```

Everything between "time, " and "\nThe end." is generated freely.

### 3. Naming (`as`)

You can name a generation to reference it later — not as a variable holding a value, but as a region of the context that can be pointed to.

```
{gen protagonist /[A-Z][a-z]+/ as hero}
walked into the {gen setting ~5 tokens as place}.

Later, {hero} returned to {place} and found it changed.
```

`hero` and `place` aren't variables. They're **back-references** into the emission stream. When you write `{hero}`, it doesn't re-emit — it makes the reference salient in the context window, telling the LLM "I'm talking about that thing from earlier." The runtime can implement this as literal re-emission, or as a pointer within the context, depending on the underlying model.

### 4. Branching (`match`)

Control flow based on generated values. The branch condition is itself generated.

```
You enter the cave. It is {gen mood enum("dark", "bright", "eerie") as mood}.

{match mood
  "dark"   => You can barely see. {gen dark_scene ~30 tokens}
  "bright" => Crystals illuminate everything. {gen bright_scene ~30 tokens}
  "eerie"  => Something feels wrong. {gen eerie_scene ~30 tokens}
}
```

The programmer doesn't decide which branch. The LLM generates the branch condition, and then subsequent generation is conditioned on being inside that branch. The programmer provides the *structure of possibilities*, not the choice.

This is fundamentally different from procedural `if/else`, where the programmer (or deterministic computation) decides the branch. Here, branching is **generative** — the decision emerges from the model.

### 5. Repetition (`for`, `repeat`)

Loops whose bounds can be generated.

```
{gen n int(3..6) as count} reasons to learn Rust:

{for i in 1..count
  {i}. {gen reason ~15 tokens}
}
```

The number of iterations is decided by the LLM. Each iteration's generation is conditioned on all previous iterations — so reason 3 knows about reasons 1 and 2 and won't repeat them (because they're in the context).

More radical — looping until a generated condition:

```
{repeat
  {gen paragraph ~50 tokens}

  {gen more enum("continue", "stop") as signal}
  until signal == "stop"
}
```

The LLM decides when to stop. The program provides the structure (paragraphs followed by a continue/stop decision), but the termination condition is emergent.

### 6. Patterns (Abstraction)

Reusable generation structures. Not functions — they don't take input and return output. They're **templates that emit** when instantiated.

```
pattern dialogue(a, b)
  {a}: {gen ~30 tokens conditioned_on(a)}
  {b}: {gen ~30 tokens conditioned_on(b)}

pattern debate(topic, rounds)
  # Debate: {topic}

  {for round in 1..rounds
    ## Round {round}
    {dialogue("Pro", "Con")}
  }

  ## Verdict
  {gen ~50 tokens}
```

Instantiation:

```
{debate("Is AI dangerous?", 3)}
```

Patterns aren't called — they're **expanded** into the emission stream, like macros, but with generation filling the holes. Each expansion creates a unique generation trajectory because the LLM produces different tokens each time.

---

## Context IS State

There are no variables. There is no heap. There is no mutable state.

There is only **context**: the sequence of all tokens emitted so far. This is the state of the program. It grows monotonically. It is never modified. And it is the basis for all future generation.

This maps directly to how transformers work: the KV cache IS the state. Every generated token is conditioned on all previous tokens. The "state" is just the history.

In procedural programming, you say "set x = 5" and later "read x" — the state is a mapping of names to values. In streaming programming, you emit "the temperature is 72 degrees" and later that emission is in the context — the LLM "knows" the temperature without any variable lookup.

```
The protagonist's name is {gen name /[A-Z][a-z]+/}.

// 200 tokens later...

// The LLM will use the right name here because it's in context.
// No variable needed. The emission IS the state.
{gen ~50 tokens}
```

Names (`as`) exist as a convenience for human readability and for explicit back-referencing. But the LLM doesn't need them — it has the context.

---

## Types Are Grammars

In procedural/functional languages, types describe the shape of data sitting in memory: `int`, `string`, `{name: string, age: int}`.

In a streaming language, types describe the shape of **valid emissions**. They're constraints on what the LLM can generate at this position. They are literally grammars:

```
int(1..100)             // a number between 1 and 100
enum("yes", "no")       // exactly one of these strings
/[A-Z][a-z]+ \d{4}/    // regex pattern
json({                   // valid JSON matching this schema
  name: string,
  age: int(0..150),
  hobbies: [string; 1..5]
})
~50 tokens              // length constraint (soft)
unconstrained           // anything goes
```

These aren't types of values. They're grammars for generation. `int(1..100)` doesn't describe a variable — it tells the constrained decoder to only allow token sequences that form an integer between 1 and 100.

This means **type checking IS grammar checking**. A well-typed streaming program is one where all `gen` blocks have satisfiable grammars, and all `match` branches cover the possible emissions of their condition.

Grammars compose:

```
// A grammar for a mailing address
grammar address
  {/\d+/} {/[A-Za-z ]+/} Street
  {/[A-Za-z]+/}, {enum("CA","NY","TX",...)} {/\d{5}/}

// Use it
Ship to: {gen address}
```

---

## Composition Is Conditioning

In functional programming, you compose by passing the output of one function as the input of another: `g(f(x))`.

In streaming programming, you compose by **putting one generation in the context of another**. Output of the first becomes the conditioning for the second.

```
// Sequential conditioning: each generation sees everything before it
{gen premise ~20 tokens}
Therefore, {gen conclusion ~20 tokens}
However, {gen counterpoint ~20 tokens}
```

This is the simplest composition. Each generation is conditioned on all prior emissions, including previous generations. The `conclusion` is influenced by the `premise`. The `counterpoint` is influenced by both.

Explicit conditioning with `given`:

```
// A generation explicitly conditioned on specific context
{given "You are a harsh literary critic."
  {gen review ~100 tokens}
}
```

The `given` block adds to the context without emitting to the output stream. It's like a system prompt — it influences generation but doesn't appear in the output. (Whether the runtime implements this as a system message, a prefix, or a soft prompt is an implementation detail.)

Pattern composition:

```
pattern summarize(source)
  {given source}
  Summary: {gen ~50 tokens}

pattern critique(source)
  {given source}
  Critique: {gen ~50 tokens}

// Compose: critique of a summary
{critique(summarize("...long text..."))}
```

`summarize` emits a summary. That entire emission becomes the argument to `critique`, which conditions on it. Composition is contextual nesting.

---

## Concurrency: Multiple Emission Streams

The interesting case: multiple generation processes running simultaneously, each conditioned on the others.

```
// Two agents, interleaved, each seeing the full conversation
agent alice {given "You are a patient teacher."}
agent bob {given "You are a confused student."}

{interleave alice, bob rounds=4
  {alice}: {gen ~30 tokens as alice}
  {bob}: {gen ~30 tokens as bob}
}
```

Each round, `alice` generates conditioned on the full conversation so far (including `bob`'s prior messages), and vice versa. The agents don't have separate state — they share the context. Their "personalities" come from their `given` blocks.

More radical — branching into parallel worlds:

```
// Fork the stream into multiple possibilities
{fork 3 as worlds
  {gen story ~200 tokens}
}
// worlds[0], worlds[1], worlds[2] are three different stories,
// all starting from the same context up to the fork point.

// Pick the best one (by some criterion)
{select worlds by coherence}
```

`fork` runs the same generation multiple times (different random seeds), producing divergent streams. `select` chooses one and makes it canonical. This is beam search elevated to a language construct.

---

## Execution Model

A streaming program executes like this:

1. Start with an empty emission stream (or a `given` preamble).
2. Walk the program structure top-to-bottom.
3. Literal text → emit directly to the stream.
4. `gen` → invoke the LLM with current context + constraint, emit generated tokens.
5. `match` → read the referenced emission, take the matching branch.
6. `for`/`repeat` → expand the body the appropriate number of times.
7. Pattern instantiation → expand the pattern body inline.
8. At each step, the full emission history is the context for the next step.

The program IS the output. Execution IS generation. There is no separate "return value." The stream of emitted tokens is the entire result.

This is what makes it a paradigm, not a library:
- In procedural: you execute statements to produce side effects.
- In functional: you evaluate expressions to produce values.
- In streaming: **you generate tokens to produce... tokens.** The process is the product.

---

## What "Debugging" Means

In procedural: step through statements, inspect variable values at each point.
In functional: trace expression reduction, see intermediate forms.
In streaming: **scrub through the emission timeline.**

A debugger for this language would be a timeline — like a video scrubber — showing:
- The emission stream at each point (what's been generated so far)
- The constraint active at each `gen` (what was the grammar?)
- The probability distribution at each token (what else could have been generated?)
- The context window contents (what was the LLM "seeing"?)
- Branch points (where did a `match` go? what were the alternatives?)
- Fork points (how did parallel worlds diverge?)

It's closer to a music sequencer or a video editor than a traditional debugger. You're inspecting a *trajectory*, not a state.

---

## What "Testing" Means

Programs are non-deterministic. Every execution produces different output. So testing is statistical, not exact.

```
test "letter always includes a date when accepted"
  runs=100
  assert /\d{4}-\d{2}-\d{2}/ in output when decision == "accepted"
  confidence=0.95

test "debate has balanced perspectives"
  runs=50
  assert sentiment(pro_args) > 0.3
  assert sentiment(con_args) < -0.3
  assert abs(length(pro_args) - length(con_args)) < 100
```

You don't test that a program produces a specific output. You test that the *distribution of outputs* satisfies properties. This is closer to property-based testing or statistical hypothesis testing than to unit testing.

Constraints (enum, regex, int range) can be tested structurally — the constrained decoder guarantees them. But semantic properties (coherence, relevance, balance) require running the program many times and checking statistical invariants.

---

## A Longer Example: Generated Adventure Game

```
pattern room(style)
  {gen room_name ~5 tokens as name}

  {gen description ~40 tokens conditioned_on(style)}

  Exits: {gen exits json([enum("north","south","east","west"); 1..3]) as exits}

  {gen detail ~20 tokens}

pattern encounter()
  You see {gen creature ~5 tokens as creature}.
  It appears {gen demeanor enum("friendly", "hostile", "neutral") as mood}.

  {match mood
    "friendly" => {gen friendly_interaction ~40 tokens}
    "hostile"  =>
      Combat! You must {gen combat_choice enum("fight", "flee", "negotiate") as choice}.
      {match choice
        "fight"     => {gen fight_scene ~50 tokens}
        "flee"      => {gen flee_scene ~30 tokens}
        "negotiate" => {gen negotiate_scene ~40 tokens}
      }
    "neutral" => {gen neutral_interaction ~30 tokens}
  }

// Main program
# The Caverns of {gen cavern_name ~3 tokens}

You are {gen player_desc ~10 tokens}. You have entered the caverns seeking
{gen motivation ~10 tokens}.

{for i in 1..{gen depth int(3..7)}
  ## Room {i}
  {room(cavern_name)}

  {gen transition ~15 tokens}

  {match {gen has_encounter enum("yes","no")}
    "yes" => {encounter()}
    "no"  => The room is empty but {gen atmosphere ~15 tokens}.
  }
}

## The Final Chamber
{gen climax ~100 tokens conditioned_on(motivation, cavern_name)}

{gen ending enum("triumph", "tragedy", "mystery") as ending}
{match ending
  "triumph" => {gen triumph ~50 tokens}
  "tragedy" => {gen tragedy ~50 tokens}
  "mystery" => {gen mystery ~50 tokens}
}
```

Every execution of this program produces a different adventure. The number of rooms, the creatures, the combat choices, the ending — all generated. But the *structure* is specified by the programmer: rooms have names, descriptions, and exits; encounters have creatures with moods; the game has a rising action and a climax. The programmer is an architect of possibility spaces, not a determiner of outcomes.

---

## Relationship to Existing Work

**LMQL, Guidance, SGLang** — These are the closest existing systems. They mix Python with constrained generation. But they're libraries within procedural languages, not a paradigm. The generation is the interesting part; the Python scaffolding is boilerplate. A streaming language would make the generation the *only* part.

**Template engines (Jinja, Handlebars)** — Structurally similar (literal text with holes) but fundamentally different: templates fill holes from a data source. Streaming programs fill holes from generation. Templates are deterministic; streaming programs are stochastic. Templates have fixed structure; streaming programs have generated structure.

**Probabilistic programming (Stan, Pyro)** — Shares the property that programs specify distributions over outputs. But probabilistic programs describe distributions for inference (given observations, what are the latent variables?). Streaming programs describe distributions for generation (given structure, produce output).

**Generative grammars (Chomsky, L-systems)** — The closest theoretical ancestor. A streaming program IS a generative grammar — a set of production rules that expand into output. The difference: the "rules" are not fixed alternatives with equal probability, but LLM-weighted continuations conditioned on context.

---

## The Philosophical Point

Every programming paradigm embeds a metaphor for what computation *is*:
- Procedural: computation is **following instructions**
- Functional: computation is **evaluating mathematical expressions**
- Logic: computation is **proving theorems**
- Streaming: computation is **generating text**

The last one is new because the computational substrate is new. You can't have a streaming paradigm without a generative model to serve as the runtime. The LLM IS the execution engine — the way a CPU is the execution engine for procedural programs and a reduction engine is the execution engine for functional programs.

The programmer's role shifts accordingly:
- Procedural programmer: writes the steps
- Functional programmer: writes the transformations
- Streaming programmer: **writes the scaffolding** — the structure, the constraints, the decision points — and lets the generative process fill in the substance

The program is a blueprint for a category of possible outputs. Execution picks one from that space. The programmer's art is in designing the space — tight enough to be useful, loose enough to be surprising.

---

## Open Questions

**Is this Turing-complete?** Probably not in the traditional sense (and that might be fine). It's complete with respect to the class of structured generation tasks. Adding escape hatches to a host language (like LMQL does with Python) would give full generality, but might dilute the paradigm.

**What about I/O?** A pure streaming program just emits text. But practical programs need to fetch data, call APIs, read files. One approach: `gen` blocks can be constrained to emit function call syntax, and the runtime intercepts and executes them, feeding results back into context. This is tool use, but as a language-level concept.

**How do you handle long context?** The emission stream IS the context window. For long programs, you hit the context limit. The runtime needs a strategy: summarization, retrieval, sliding window. This is a runtime concern, but the language might need constructs for it (`forget`, `summarize_above`, context windowing annotations).

**Can streaming programs compose with conventional programs?** A streaming program could be invoked from Python as a generator. A Python function could be invoked from a streaming program as a tool. The boundary is where deterministic computation meets stochastic generation.

**What's the cost model?** Every `gen` costs money (API tokens). The language should make cost visible — perhaps every program has an estimated cost range, and the type checker can warn when a `for` loop with generated bounds could produce unbounded cost.
