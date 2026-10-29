/** A titled block of a settings-style page: heading and intro on the left from md, fields on the right. */
export function FormSection({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-b pb-8 last:border-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8"
    >
      <div className="space-y-1">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
