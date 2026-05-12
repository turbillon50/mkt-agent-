import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listPosts } from '@/lib/data';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PostsPage() {
  let rows: Awaited<ReturnType<typeof listPosts>> = [];
  let error: string | null = null;
  try {
    rows = await listPosts();
  } catch (e) {
    error = e instanceof Error ? e.message : 'failed to load posts';
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Posts</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Todo lo que ha publicado el agente, ordenado por fecha.
        </p>
      </header>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap">{error}</pre>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Sin posts todavía. Lanza un <code>npm run cli run</code> o usa el chat.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{p.platform}</Badge>
                    {p.topic && <span className="text-sm">{p.topic}</span>}
                  </div>
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(p.publishedAt ?? p.createdAt)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="whitespace-pre-wrap text-sm">{p.text}</p>
                {p.externalUrl && (
                  <a
                    href={p.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline text-[var(--color-muted-foreground)]"
                  >
                    {p.externalUrl}
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
