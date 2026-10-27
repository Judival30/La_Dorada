type PageHeaderProps = { title: string; description?: string };

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <h1 className="ld-h1">{title}</h1>
      {description ? <p className="mt-1 max-w-[62ch] text-ld-muted">{description}</p> : null}
    </header>
  );
}
