import { useState } from "react";
import { Form, Link, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Button, Card, Field, Input, Select, Textarea } from "@aihot/web/features/admin/ui";
import { depthDiff, type ReviewEntry, type ReviewQueue, type StoryDepth } from "../contracts.ts";

export async function loader({ request }: { request: Request }) {
  return adminGet<ReviewQueue>(request, `/api/admin/review${new URL(request.url).search}`);
}

export const meta = () => [{ title: "Editorial review" }, { name: "robots", content: "noindex" }];

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

function CitationFields({ evidence, reportId, quote, onReport, onQuote }: {
  evidence: ReviewEntry["evidence"];
  reportId: string;
  quote: string;
  onReport: (id: string) => void;
  onQuote: (quote: string) => void;
}) {
  return (
    <>
      <Field label="Source report">
        <Select value={reportId} onChange={(e) => onReport(e.target.value)}>
          {evidence.map((e) => <option key={e.id} value={e.id}>{e.source}: {e.title}</option>)}
        </Select>
      </Field>
      <TextField label="Exact supporting quote" value={quote} onChange={onQuote} />
    </>
  );
}

function DraftEditor({ entry }: { entry: ReviewEntry }) {
  const { run, busy } = useAdminAction();
  const [draft, setDraft] = useState(entry.draft);
  const [note, setNote] = useState("");
  const change = <K extends keyof StoryDepth>(key: K, value: StoryDepth[K]) => setDraft((d) => d ? { ...d, [key]: value } : d);
  const number = (i: number, patch: Partial<StoryDepth["numbers"][number]>) => {
    if (draft) change("numbers", draft.numbers.map((n, j) => j === i ? { ...n, ...patch } : n));
  };
  const reaction = (i: number, patch: Partial<StoryDepth["reactions"][number]>) => {
    if (draft) change("reactions", draft.reactions.map((r, j) => j === i ? { ...r, ...patch } : r));
  };
  const submit = (command: "save" | "publish" | "reject") => run("POST", `/api/admin/review/${entry.id}`, {
    version: entry.version, command, content: draft, note,
  }, { success: command === "publish" ? "Published" : command === "reject" ? "Rejected" : "Saved" });

  return (
    <Card title={<a href={`/story/${entry.publicId}`}>{entry.title}</a>} right={`Story depth · ${entry.status}`}>
      <div className="space-y-4">
        {entry.error && <p role="alert">{entry.error}</p>}
        {entry.status === "queued" && <p>Waiting for the worker. Refresh to check progress.</p>}
        {draft && (
          <>
            <TextField label="Background" value={draft.background} onChange={(v) => change("background", v)} />
            <fieldset className="space-y-3">
              <legend className="font-semibold">Key numbers</legend>
              {draft.numbers.map((n, i) => (
                <div key={i} className="space-y-2 rounded border border-line p-3">
                  <TextField label="Figure (verbatim from quote)" value={n.value} onChange={(value) => number(i, { value })} />
                  <TextField label="Context, units and conditions" value={n.context} onChange={(context) => number(i, { context })} />
                  <CitationFields evidence={entry.evidence} reportId={n.reportId} quote={n.quote}
                    onReport={(reportId) => number(i, { reportId })} onQuote={(quote) => number(i, { quote })} />
                  <Button size="sm" onClick={() => change("numbers", draft.numbers.filter((_, j) => j !== i))}>Remove figure</Button>
                </div>
              ))}
              <Button size="sm" disabled={draft.numbers.length >= 10} onClick={() => change("numbers", [
                ...draft.numbers, { value: "", context: "", reportId: entry.evidence[0]?.id ?? "", quote: "" },
              ])}>Add figure</Button>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="font-semibold">Reactions</legend>
              {draft.reactions.map((r, i) => (
                <div key={i} className="space-y-2 rounded border border-line p-3">
                  <TextField label="Who" value={r.who} onChange={(who) => reaction(i, { who })} />
                  <TextField label="Reaction" value={r.text} onChange={(text) => reaction(i, { text })} />
                  <CitationFields evidence={entry.evidence} reportId={r.reportId} quote={r.quote}
                    onReport={(reportId) => reaction(i, { reportId })} onQuote={(quote) => reaction(i, { quote })} />
                  <Button size="sm" onClick={() => change("reactions", draft.reactions.filter((_, j) => j !== i))}>Remove reaction</Button>
                </div>
              ))}
              <Button size="sm" disabled={draft.reactions.length >= 10} onClick={() => change("reactions", [
                ...draft.reactions, { who: "", text: "", reportId: entry.evidence[0]?.id ?? "", quote: "" },
              ])}>Add reaction</Button>
            </fieldset>
            <TextField label="What it accelerates" value={draft.accelerates} onChange={(v) => change("accelerates", v)} />
            <Field label="Index path (optional)">
              <Input placeholder="/index/cost-of-intelligence" value={draft.curve?.path ?? ""}
                onChange={(e) => change("curve", e.target.value ? { path: e.target.value, label: draft.curve?.label ?? "" } : null)} />
            </Field>
            {draft.curve && <TextField label="Index link label" value={draft.curve.label} onChange={(label) => change("curve", { ...draft.curve!, label })} />}
            <details open={!!entry.published}>
              <summary>Changes against published version{entry.published ? "" : " (first draft)"}</summary>
              <div className="mt-3 space-y-4">
                {depthDiff(entry.published, draft).map((d) => (
                  <div key={d.field}>
                    <h3 className="font-semibold">{d.field}</h3>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div><p>Published</p><pre className="whitespace-pre-wrap break-words text-sm"><del>{d.before}</del></pre></div>
                      <div><p>Draft</p><pre className="whitespace-pre-wrap break-words text-sm"><ins>{d.after}</ins></pre></div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
        <details>
          <summary>Source evidence ({entry.evidence.length})</summary>
          {entry.evidence.map((e) => (
            <div key={e.id} className="mt-3">
              <a className="text-accent underline" href={`/items/${e.id}`}>{e.source}: {e.title}</a>
              <pre className="whitespace-pre-wrap break-words text-sm">{e.text}</pre>
            </div>
          ))}
        </details>
        <TextField label="Review note — explain the facts and judgment you checked before publication" value={note} onChange={setNote} />
        <div className="flex flex-wrap gap-3">
          {draft && (
            <>
              <Button disabled={busy} onClick={() => submit("save")}>Save edits</Button>
              <Button tone="primary" disabled={busy || !note.trim()} onClick={() => submit("publish")}>Publish approved depth</Button>
            </>
          )}
          <Button tone="danger" disabled={busy} onClick={() => submit("reject")}>Reject{entry.status === "queued" ? " request" : " draft"}</Button>
        </div>
      </div>
    </Card>
  );
}

export default function ReviewPage() {
  const data = useLoaderData<typeof loader>();
  const { run, busy } = useAdminAction();
  const refresh = useRevalidator();
  const [search] = useSearchParams();
  const pageLink = (page: number) => {
    const params = new URLSearchParams(search);
    params.set("page", String(page));
    return `?${params}`;
  };
  return (
    <AdminPage title="Editorial review · 待审"
      subtitle="Check the source evidence, edit the interpretation, and record your review before publishing. Drafts are private."
      actions={<Button onClick={() => refresh.revalidate()}>Refresh queue</Button>}>
      <section className="space-y-4" aria-label="Pending reviews">
        {data.entries.length ? data.entries.map((entry) => <DraftEditor key={`${entry.id}:${entry.version}`} entry={entry} />) : <p>No pending drafts.</p>}
      </section>
      <Card className="mt-6" title="Choose a story to deepen">
        <Form method="get" className="flex gap-3">
          <Input aria-label="Search stories" name="q" defaultValue={search.get("q") ?? ""} placeholder="Title or story ID" />
          <Button type="submit">Search</Button>
        </Form>
        <ul className="divide-y divide-line">
          {data.stories.map((story) => (
            <li key={story.id} className="flex items-center justify-between gap-4 py-3">
              <a href={`/story/${story.publicId}`}>{story.title}</a>
              <Button size="sm" disabled={busy || data.entries.some((e) => e.subjectId === String(story.id))}
                onClick={() => run("POST", "/api/admin/review/deepen", { storyId: story.id }, { success: "Draft requested" })}>
                {story.published ? "Re-draft" : "Deepen"}
              </Button>
            </li>
          ))}
        </ul>
        <nav className="mt-3 flex gap-4">
          {data.page > 1 && <Link to={pageLink(data.page - 1)}>Previous</Link>}
          {data.hasMore && <Link to={pageLink(data.page + 1)}>Next</Link>}
        </nav>
      </Card>
    </AdminPage>
  );
}
