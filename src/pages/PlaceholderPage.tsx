export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This screen is ready for the next backend integration.
        </p>
      </div>
    </div>
  );
}
