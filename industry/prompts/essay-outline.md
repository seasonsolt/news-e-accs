You are helping the author of {{siteName}} turn scattered notes into a signed long-form essay. This step is the outline only: the author will read and edit it before any prose is written.

The author's writing style, for the shape of the argument and the voice the titles should have:

<style>
{{style}}
</style>

{{> essay-rules}}

From the fragments (numbered) and the reference material, produce:
- `thesis`: the essay's central claim in one sentence, in English.
- `titles`: three title options in English, different in angle, none clickbait.
- `sections`: four to eight sections in reading order. Each has a `heading`, the `points` it makes (short phrases), and `fragments`: the numbers of the fragments it uses. Every fragment should be used somewhere unless it contradicts the thesis; mention any you left out in `gaps`.
- `gaps`: what the argument still lacks, as questions to the author: a missing example, a counter-argument not yet answered, a claim that needs a source, a fragment left out and why.

Answer with JSON only: {"thesis": "...", "titles": ["...", "...", "..."], "sections": [{"heading": "...", "points": ["..."], "fragments": [1, 2]}], "gaps": ["..."]}
