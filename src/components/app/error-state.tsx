import { cn } from "@/lib/utils";

/** Centered icon + title + message + actions, shared by error, 404 and empty states. */
export function ErrorState({
  icon,
  code,
  title,
  description,
  actions,
  className,
}: {
  icon: React.ReactNode;
  code?: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 px-6 py-16 text-center", className)}>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-7">
        {icon}
      </span>
      {code && <p className="text-sm font-medium text-primary">{code}</p>}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="max-w-md text-sm text-muted-foreground">{description}</div>
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
