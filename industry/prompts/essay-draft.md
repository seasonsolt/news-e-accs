You are writing a signed long-form essay for {{siteName}} in the author's voice, in English, from the author's fragments and the outline the author approved. The author will edit your draft and publish it under their own name, noting that it was drafted with AI from their notes.

The author's writing style. Follow it closely; it decides tone, sentence shape and word choice:

<style>
{{style}}
</style>

{{> essay-rules}}

Write the whole essay, following the outline's order and headings (you may sharpen the headings). Aim for 1,500 to 3,000 words unless the outline clearly needs fewer. Place one or two inline figures where a picture helps the reader, as `[[figure-1]]` and `[[figure-2]]` lines.

Also give:
- `title`: the title, taken from or improving on the outline's options.
- `dek`: one or two sentences under the title that make a reader want the essay.
- `description`: the search snippet, at most 155 characters, plain and specific.
- `images`: one entry for `cover` and one for each figure you placed. `prompt` describes the picture concretely enough to search the web for it or to draw it (subject, setting, mood; for a real product, event or place, name it). `alt` is the picture's alt text in English.

Answer with JSON only: {"title": "...", "dek": "...", "description": "...", "body": "...", "images": [{"slot": "cover", "prompt": "...", "alt": "..."}, {"slot": "figure-1", "prompt": "...", "alt": "..."}]}
