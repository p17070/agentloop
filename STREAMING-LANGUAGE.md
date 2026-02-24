# What Would a Streaming Programming Language Look Like?

A design exploration prompted by the observation that LLM outputs are inherently streaming — tokens arrive one at a time over seconds — yet mainstream programming languages treat values as complete and instantaneous. The mismatch creates boilerplate: event handlers, state machines for parsing partial JSON, manual buffering. What if streaming were the foundation, not an afterthought?

---

## The Core Insight

Every programming language has a notion of a **value** — a thing that *is*. A string is `"hello"`. A number is `42`. You call a function, it returns a value, done.

But an LLM output is not a value. It is a **becoming**. It starts as nothing, accumulates tokens, and eventually converges into a final string. Between start and convergence, it is *partially something* — usable, interpretable, even actionable, but not yet complete.

Current languages force a choice:
- **Block until done** — `await llm("...")` — simple, but throws away latency and composability.
- **Callback soup** — `llm("...", { onToken: (t) => ... })` — powerful, but obscures control flow.
- **Async iterators** — `for await (const chunk of llm("..."))` — better, but still second-class. You can't pass a "partially completed string" to another function and have it do something useful.

A streaming-first language would make **partially completed values** a first-class concept in the type system, the syntax, and the runtime.

---

## The `~` Type Modifier

The central language construct: any type `T` has a streaming variant `T~` (pronounced "T stream" or "T flowing"). A `string~` is a string that is still being written. A `{name: string, age: int}~` is a record whose fields are still being populated.

```
let story~ = llm("Tell me a story")    // story~ is string~
print(story~)                           // prints tokens as they arrive
```

The `~` is not syntactic sugar for `AsyncIterator<T>` or `Observable<T>`. It represents a **monotonically accumulating value** — one that only grows, never shrinks, and eventually converges to a final `T`.

### Subtyping

```
T <: T~       // any complete value is a trivially-converged stream
              // so you can pass a string where string~ is expected
```

This means every function that accepts `string~` also accepts `string`. Streaming is the general case; completed values are the special case.

### Convergence

```
let final: string = await story~        // block until stream ends
let partial: string = snapshot(story~)  // grab current state without blocking
let timed: string = await story~ | timeout(5s)  // take whatever's there after 5s
```

---

## Reactive Dataflow

Operations on streaming values produce streaming results. The runtime propagates tokens downstream automatically.

```
let response~ = llm("Tell me about Paris")
let upper~ = response~.toUpperCase()         // also string~ — transforms tokens as they arrive
let words~ = response~ |> split(" ")         // string[]~ — array that grows as words complete
let count~ = words~ |> length                // int~ — updates in real-time: 1, 2, 3, ...

print(count~)  // prints: 1 2 3 4 5 ... 247
```

This is like a spreadsheet where downstream cells update as upstream cells change — but streams are monotonic, so it's incremental computation, not arbitrary reactivity. No cycles, no glitches, no diamond problems.

---

## Incremental Structured Data

This is where it gets interesting. When an LLM generates JSON like `{"name": "Alice", "age": 30}`, at various points in time the raw text is:

```
t=0   {
t=1   {"name":
t=2   {"name": "Al
t=3   {"name": "Alice",
t=4   {"name": "Alice", "age": 30}
```

An incremental JSON parser can emit partial structure. The language represents this as a record where individual fields are themselves streams:

```
let data~ = response~ |> json<{name: string, age: int}>

// data~.name is string~ — starts emitting at t=2, converges at t=3
// data~.age is int~     — pending until t=4, then converges instantly

// You can use data~.name before data~.age even begins
greet(data~.name)  // "Hi Al..." → "Hi Ali..." → "Hi Alice"
```

The type of `data~` is not just `{name: string, age: int}~`. It is `{name: string~, age: int~}` — the streaming distributes over the record fields. Each field has its own timeline.

For arrays, streaming distributes over elements:

```
let items~ = response~ |> json<string[]>
// items~ emits elements one at a time as they're parsed
// items~[0] is available before items~[1] exists
for item~ in items~ {
    print(await item~)  // prints each item as it completes
}
```

This isn't limited to JSON. Any format with an incremental parser — XML, CSV, line-delimited text, YAML — gets the same treatment:

```
let rows~ = response~ |> csv<{x: float, y: float}>
let plot~ = rows~ |> scatter_plot    // plot updates as rows arrive
render(plot~)
```

---

## Cancellation as First-Class Control Flow

If you can act on partial data, you should be able to *stop generating* when you have enough. Cancellation propagates upstream automatically.

```
let response~ = llm("List 100 interesting facts")
let first_five~ = response~ |> lines |> take(5)
// After 5 lines are captured, `take` signals completion.
// This propagates upstream: the LLM generation is cancelled.
// You save tokens, money, and latency.
print(await first_five~)
```

Cancellation works through arbitrary pipelines:

```
let response~ = llm("Generate a report")
let parsed~ = json(response~)
let validated~ = validate(parsed~, schema)

match validated~ {
    Error(e) => {
        // Validation failed on partial data — abort everything
        cancel(response~)       // stops generation
        handle(e)
    }
    Ok(data~) => process(data~)
}
```

Resource cleanup follows cancellation:

```
let response~ = llm("Write a long essay")
defer { log("Generation complete or cancelled, tokens used: {response~.usage}") }

// If we cancel response~, the defer block still runs.
// HTTP connections are closed, token counts are finalized.
```

---

## Streaming Functions

Functions can be declared `stream` to indicate they produce output incrementally:

```
stream fn translate(input~: string~, lang: string) -> string~ {
    // Process input sentence by sentence
    for sentence~ in input~ |> split_by(".") {
        let s = await sentence~                     // wait for complete sentence
        yield llm("Translate to {lang}: {s}")~      // stream the translation out
    }
}

// Usage: streaming in, streaming out
let english~ = llm("Tell me about Paris")
let french~ = translate(english~, "fr")
print(french~)    // prints French translation incrementally
```

The function type system captures this:

```
(T~) -> U~      // streaming transformer — streaming in, streaming out
(T~) -> U       // streaming reducer — streaming in, converged out
(T)  -> U~      // generator — value in, streaming out
(T)  -> U       // pure function — value in, value out
```

All four are useful. A streaming-first language makes the first three as natural as the fourth.

---

## Partial Pattern Matching

Pattern matching can operate on incomplete data. The runtime re-evaluates matches as more data arrives:

```
let response~ = llm("Analyze this data")

match response~ {
    // Fires as soon as "ERROR" appears anywhere in the stream
    /ERROR: (.*)/ as err~ => {
        cancel(response~)
        alert(err~)
    }
    // Fires when the stream converges and no ERROR was found
    converged(text) => {
        process(text)
    }
}
```

For structured streaming data:

```
let action~ = llm("What should I do?", tools: [search, calculate])~ |> parse_tool_call

match action~ {
    // As soon as we know it's a tool call, start preparing
    ToolCall { name: "search", args~ } => {
        // args~ still streaming, but we can start warming up the search engine
        prepare_search()
        let result = search(await args~)
        respond_with(result)
    }
    ToolCall { name: "calculate", args~ } => {
        calculate(await args~)
    }
    Text(t~) => print(t~)
}
```

The key idea: you can match on the *shape* of data before all the *content* is available. You know it's a `ToolCall` with name `"search"` before the arguments finish generating.

---

## Multi-Agent Composition

Chaining LLM calls where one's output feeds another's input is a natural streaming pattern:

```
// Pipeline: generate → critique → revise
let draft~ = llm("Write an essay about climate change")
let critique~ = llm("Critique this essay:\n{await draft~}")
let final~ = llm("Revise based on feedback:\nEssay: {await draft~}\nCritique: {await critique~}")
print(final~)
```

With today's LLM APIs, you must `await` before sending to the next model (APIs don't accept incremental prompts). But the language can express the *intent* for streaming composition, and the runtime handles the buffering:

```
// The `|>~` operator: streaming pipe with buffering
// Sends accumulated tokens to the next LLM as context,
// re-invoking if the upstream hasn't converged yet.
let result~ = llm("Generate data")
          |>~ llm("Clean this: {_}")
          |>~ llm("Format this: {_}")
```

More realistically, parallel multi-agent patterns:

```
// Race: first model to produce a valid answer wins
let answer~ = race(
    llm("Solve: ...", model: "claude-4"),
    llm("Solve: ...", model: "gpt-5"),
) |> first(valid)
// Loser is cancelled automatically

// Fan-out/fan-in: multiple perspectives, merged
let perspectives~[] = parallel(
    llm("Analyze from economic perspective: ..."),
    llm("Analyze from social perspective: ..."),
    llm("Analyze from technical perspective: ..."),
)
let synthesis~ = llm("Synthesize these analyses:\n{await all(perspectives~)}")
```

---

## Stream Combinators

The standard library provides composable stream operations:

```
// Merging
merge(a~, b~) -> (A | B)~          // interleave as tokens arrive
concat(a~, b~) -> A~               // a~ first, then b~ (sequential)

// Filtering and slicing
take(s~, n) -> T~                   // first n elements, cancel rest
skip(s~, n) -> T~                   // drop first n elements
filter(s~, pred) -> T~              // only matching elements
take_until(s~, pred) -> T~          // take until predicate fires

// Accumulation
scan(s~, init, f) -> U~            // running fold (like reduce but streams intermediate results)
buffer(s~, n) -> T[]~              // collect into chunks of n
window(s~, n) -> T[]~              // sliding window of size n

// Duplication and sharing
tee(s~) -> (T~, T~)                // duplicate a stream (streams are affine by default)
broadcast(s~, n) -> T~[]           // duplicate to n consumers
cache(s~) -> T~                    // memoize — multiple consumers see same data

// Timing
throttle(s~, rate) -> T~           // limit emission rate
debounce(s~, delay) -> T~          // wait for pause in emission
timeout(s~, duration) -> T~        // error if no emission within duration

// Combination
zip(a~, b~) -> (A, B)~            // pair up (waits for both)
race(a~, b~) -> (A | B)~          // first to emit wins
```

---

## Error Handling

Streams can fail mid-way. The language makes partial results accessible even after failure:

```
try {
    let data~ = llm("Generate report") |> json<Report>
    process(data~)
} catch StreamError { partial, error } {
    // `partial` is whatever was successfully received before failure
    // Maybe the JSON was 80% complete — that's still useful
    log("Partial result: {partial}")
    log("Error: {error}")

    // Retry with context
    let retry~ = llm("Continue this partial JSON:\n{partial}")~
    process(retry~)
}
```

Or with pattern matching:

```
let result~ = llm("...")~ |> json<Data> |> catch {
    Timeout(partial) => default_with(partial)
    ParseError(raw~, pos) => llm("Fix this JSON:\n{raw~}")~ |> json<Data>
    RateLimit(retry_after) => { sleep(retry_after); retry() }
}
```

---

## Resource Management and Budgets

Streams hold resources — HTTP connections, memory buffers, API quotas. The language tracks these:

```
// Token budgets
budget(max_tokens: 1000) {
    let a~ = llm("First task")       // uses ~200 tokens
    let b~ = llm("Second task")      // uses ~300 tokens
    let c~ = llm("Third task")       // uses ~400 tokens
    let d~ = llm("Fourth task")      // would exceed budget — runtime pauses/errors
}

// Cost tracking (streaming cost is known as tokens arrive)
let response~ = llm("...")
print(response~.cost~)   // cost~ updates in real-time: $0.001, $0.002, ...

// Conditional cancellation based on cost
when response~.cost~ > $0.05 {
    cancel(response~)
    warn("Generation cancelled: cost exceeded $0.05")
}
```

Streams are **affine by default** — consumed once, like Rust iterators. This prevents accidental double-consumption and makes resource cleanup predictable:

```
let s~ = llm("...")
print(s~)
print(s~)         // COMPILE ERROR: s~ already consumed

let (a~, b~) = tee(s~)   // explicitly duplicate
print(a~)
log(b~)           // both work
```

---

## The Runtime Model

- **Green threads / fibers** — each stream runs on a lightweight fiber. Millions of concurrent streams are feasible.
- **Cooperative scheduling** — fibers yield at token boundaries. No preemption needed since LLM tokens are natural yield points.
- **Backpressure** — if a consumer is slow, the producer pauses. No unbounded buffering. For LLMs, this means the HTTP response body simply isn't read until the consumer is ready.
- **Connection pooling** — multiple LLM calls to the same provider share HTTP/2 connections.
- **Garbage collection** — past tokens in a stream are GC'd once consumed, unless `buffer()` or `cache()` is used. A stream processing 100K tokens doesn't need 100K tokens of memory.

---

## Complete Example: Streaming Research Agent

Putting it all together — a research agent that searches, reads, and synthesizes, all streaming:

```
stream fn research(question: string) -> string~ {
    // Step 1: Generate search queries (streaming)
    let queries~ = llm("Generate 3 search queries for: {question}")~
                   |> lines
                   |> take(3)

    // Step 2: Execute searches in parallel as queries arrive
    let results~[] = queries~ |> map(q~ => {
        let query = await q~
        search(query)                    // returns SearchResult[]
    }) |> parallel

    // Step 3: Read top results
    let contents~ = results~
        |> flatten
        |> take(5)
        |> map(r => fetch(r.url))
        |> parallel

    // Step 4: Synthesize (starts as soon as all content is ready)
    let context = await all(contents~)
    yield llm("Based on these sources, answer: {question}\n\nSources:\n{context}")~
}

// Usage
let answer~ = research("What are the latest advances in fusion energy?")
print(answer~)
// Tokens start printing as soon as synthesis begins.
// Total time: overlapped search + fetch + generation,
// not sequential search THEN fetch THEN generation.
```

---

## What This Language Is NOT

**Not a general-purpose reactive programming framework.** Rx/Observables handle arbitrary event streams (mouse clicks, WebSocket messages) that can be empty, bursty, or infinite. This language is optimized for a narrower pattern: **monotonically accumulating values that converge** — which is exactly what LLM generation, incremental parsing, and streaming computation produce.

**Not just async/await with extra steps.** Async/await gives you "pending or done." This gives you "pending, partially available, and done" — with the partial state being typed, composable, and actionable. The `~` type modifier captures something that `Promise<T>` cannot: the fact that there is useful intermediate state.

**Not dataflow programming / FBP.** Those systems route discrete messages between components. Here, the primitive is a *continuous accumulation* — a value that grows richer over time and eventually stabilizes. The mental model is closer to convergent CRDTs than to message queues.

---

## Open Questions

1. **How deep does `~` distribute?** If you have `Map<string, int[]>~`, is each key a `string~`? Each array element an `int~`? How deep does the incremental structure go? Probably needs explicit depth control.

2. **Speculative execution.** If downstream starts processing based on partial data, and later tokens invalidate the assumption, should the language support rollback? CPU speculative execution suggests yes, but the complexity is high.

3. **Persistence and replay.** Should streams be replayable? A `buffer`ed stream could be saved to disk and replayed — useful for debugging and testing. But this conflicts with the affine-by-default design.

4. **Integration with existing ecosystems.** How does `string~` interop with a function expecting `string`? Implicit `await` (like implicit `.unwrap()`)? Or explicit everywhere? The subtyping rule `T <: T~` helps but the reverse direction (`T~ → T`) is the question.

5. **Debugging.** How do you debug a pipeline of streaming transformations? Need a time-travel debugger that can show the state of every stream at any point in time. Probably a visual tool, not a text-based REPL.

6. **What is the compilation target?** Does this compile to JavaScript/WASM (for browser use), native code, or is it interpreted? The green thread runtime suggests either native (like Go) or a custom VM.

7. **Backpressure across LLM calls.** If model A streams into model B, but model B's API doesn't support incremental prompts, the runtime must buffer. How does the language surface this forced-await to the programmer? Should it be invisible (simpler) or explicit (more honest)?

---

## Why This Matters

The current way we interact with LLMs from code is essentially: call function, get string back, parse string, do something. Streaming is bolted on as an optimization. But as LLM calls become the dominant I/O operation in many applications — replacing database queries and API calls as the primary source of data — the "call and wait" model becomes increasingly inadequate.

A streaming-first language wouldn't just make LLM code more ergonomic. It would change how we think about LLM composition, enabling patterns that are theoretically possible today but practically too painful to implement: incremental validation, early abort on bad outputs, parallel speculative generation, real-time cost control, and fluid multi-agent pipelines where data flows continuously rather than in discrete request-response pairs.

The `~` type modifier is a small syntactic addition, but it represents a large semantic shift: from "values that are" to "values that are becoming." For a world where the most important computation is an LLM gradually producing tokens, that shift seems overdue.
