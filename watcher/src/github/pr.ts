// Opens a pull request with an approved fix on the sandbox repository. Never merges:
// merging stays with the owner on GitHub, and the demo's main branch keeps its planted faults.

type Edit = { file: string; find: string; replace: string };

export type PrResult = { ok: true; url: string; number: number; branch: string; base_sha: string } | { ok: false; error: string };

export async function openFixPullRequest(opts: {
  repo: string; // owner/name
  token: string;
  edits: Edit[];
  branch: string; // e.g. jr/fix-12
  title: string;
  body: string;
}): Promise<PrResult> {
  const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`https://api.github.com/repos/${opts.repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${opts.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "jaagteraho-watcher",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  };

  try {
    const repo = await api<{ default_branch: string }>("GET", "");
    const base = repo.default_branch;
    const ref = await api<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodeURIComponent(base)}`);
    const baseSha = ref.object.sha;

    // Re-apply the edits to the code as it is now; refuse if the code has moved since the diagnosis.
    const byFile = new Map<string, Edit[]>();
    for (const e of opts.edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
    const updated: Array<{ path: string; content: string; sha: string }> = [];
    for (const [path, edits] of byFile) {
      const file = await api<{ content: string; sha: string }>("GET", `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${baseSha}`);
      let text = Buffer.from(file.content, "base64").toString("utf8");
      for (const e of edits) {
        const first = text.indexOf(e.find);
        if (first === -1 || text.indexOf(e.find, first + 1) !== -1) return { ok: false, error: `the code in ${path} has changed since the diagnosis` };
        text = text.slice(0, first) + e.replace + text.slice(first + e.find.length);
      }
      updated.push({ path, content: text, sha: file.sha });
    }

    await api("POST", "/git/refs", { ref: `refs/heads/${opts.branch}`, sha: baseSha });
    for (const f of updated) {
      await api("PUT", `/contents/${f.path.split("/").map(encodeURIComponent).join("/")}`, {
        message: `${opts.title}\n\nProposed by JaagteRaho, approved by the owner.`,
        content: Buffer.from(f.content, "utf8").toString("base64"),
        sha: f.sha,
        branch: opts.branch,
      });
    }
    const pr = await api<{ html_url: string; number: number }>("POST", "/pulls", { title: opts.title, head: opts.branch, base, body: opts.body });
    return { ok: true, url: pr.html_url, number: pr.number, branch: opts.branch, base_sha: baseSha };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
