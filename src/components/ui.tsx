import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { label as humanLabel, taskStatusLabel } from "@/lib/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- button --------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "creative" | "positive" | "caution" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // Graphite = ordinary primary action; coral = creation; emerald = positive completion.
  primary:
    "bg-brand-600 text-on-brand shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-200 disabled:text-navy-600",
  secondary:
    "border border-navy-200 bg-surface/60 text-brand-600 shadow-sm backdrop-blur-sm hover:border-navy-300 hover:bg-brand-50",
  ghost: "text-navy-700 hover:bg-navy-100",
  danger: "bg-red-600 text-on-danger shadow-sm hover:bg-red-700 disabled:bg-red-200 disabled:text-navy-600",
  creative: "bg-coral-500 text-on-coral shadow-sm hover:bg-coral-600 active:bg-coral-700 disabled:bg-coral-200 disabled:text-navy-600",
  positive: "bg-emerald-500 text-on-teal shadow-sm hover:bg-emerald-600 active:bg-emerald-700 disabled:bg-emerald-200 disabled:text-navy-600",
  caution: "bg-amber-300 text-on-caution shadow-sm hover:bg-amber-400 active:bg-amber-500 disabled:bg-amber-100 disabled:text-navy-600",
  subtle: "bg-brand-50 text-brand-600 hover:bg-brand-100",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md") =>
  cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
  );

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={cn(buttonClass(variant, size), className)} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Link>,
  "href" | "className" | "children"
>) {
  return (
    <Link href={href} className={cn(buttonClass(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}

/* --------------------------------- inputs --------------------------------- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-navy-800">
        {label}
        {required ? (
          <span className="ml-1 text-brand-600" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(required)</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-xs text-navy-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn("field-input", className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn("field-input min-h-[96px] resize-y", className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={cn("field-input pr-8", className)}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; description?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-navy-50", className)}>
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
      />
      <span>
        <span className="block text-sm font-medium text-navy-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-navy-500">{description}</span> : null}
      </span>
    </label>
  );
}

/* --------------------------------- layout --------------------------------- */

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={cn("card-surface", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-navy-200 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-navy-950">{title}</h2>
        {description ? <div className="mt-0.5 text-[13px] text-navy-500">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {eyebrow ? <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-navy-950 sm:text-[28px]">{title}</h1>
          {description ? <div className="mt-2 text-sm leading-6 text-navy-600">{description}</div> : null}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-navy-500">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-surface", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-navy-950">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-navy-500">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* --------------------------------- badges --------------------------------- */

const tones = {
  neutral: "bg-navy-100 text-navy-800",
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  info: "bg-brand-50 text-brand-600",
  coral: "bg-coral-500 text-on-coral",
} as const;

export type Tone = keyof typeof tones;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-150",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusTones: Record<string, Tone> = {
  draft: "neutral",
  published: "success",
  open: "info",
  reviewing_interest: "warning",
  assigned: "brand",
  in_progress: "brand",
  submitted: "warning",
  revision_requested: "warning",
  accepted: "success",
  completed: "success",
  cancelled: "neutral",
  pending: "warning",
  approved: "success",
  rejected: "danger",
  in_review: "warning",
  blocked: "danger",
  active: "success",
  suspended: "danger",
  restricted: "warning",
  needs_review: "warning",
  unsupported: "danger",
  documented: "success",
  ready: "success",
  failed: "danger",
  processing: "info",
  queued: "neutral",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTones[status] ?? "neutral"} className={cn("motion-status", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {humanLabel(status)}
    </Badge>
  );
}

/**
 * Task statuses use work language (To do / Needs review / Approved), not system
 * values, and carry a text label as well as colour so status never relies on hue.
 */
const taskTones: Record<string, string> = {
  draft: "bg-status-todo text-status-todo-text",
  open: "bg-status-todo text-status-todo-text",
  reviewing_interest: "bg-status-todo text-status-todo-text",
  assigned: "bg-status-todo text-status-todo-text",
  in_progress: "bg-status-progress text-status-progress-text",
  submitted: "bg-status-review text-status-review-text",
  revision_requested: "bg-status-review text-status-review-text",
  completed: "bg-status-approved text-status-approved-text",
  blocked: "bg-status-blocked text-status-blocked-text",
  cancelled: "bg-status-todo text-status-todo-text",
  needs_review: "bg-status-review text-status-review-text",
  approved: "bg-status-approved text-status-approved-text",
};

export function TaskStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "motion-status inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-150",
        taskTones[status] ?? "bg-status-todo text-status-todo-text",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {taskStatusLabel(status)}
    </span>
  );
}

export function SkillTag({ name, href }: { name: string; href?: string }) {
  const content = <span className="rounded-md bg-brand-50 px-2 py-1 text-[12px] font-medium text-brand-600">{name}</span>;
  return href ? <Link href={href}>{content}</Link> : content;
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11px] font-medium text-surface group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

/* --------------------------------- avatars -------------------------------- */

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span
      className={cn(
        "avatar-surface inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

export function AvatarGroup({
  people,
  max = 4,
}: {
  people: { displayName: string; avatarFileId?: string | null }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <span key={`${person.displayName}-${index}`} className="-ml-2 first:ml-0 ring-2 ring-surface">
          <Avatar name={person.displayName} size={28} src={person.avatarFileId ? `/api/files/${person.avatarFileId}` : null} />
        </span>
      ))}
      {extra > 0 ? (
        <span className="-ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-navy-100 px-1.5 text-[11px] font-semibold text-navy-600 ring-2 ring-surface">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------- states --------------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-surface/50 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-navy-400">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-[13px] leading-6 text-navy-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    info: "border-brand-200 bg-brand-50 text-brand-600",
    success: "border-emerald-200 bg-emerald-50 text-emerald-600",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-600",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-[13px] leading-6", styles)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div className="mb-4 space-y-2">
      {error ? (
        <Alert tone="danger" title="That didn't work">
          <p>{error}</p>
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success">
          <p>{notice}</p>
        </Alert>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden="true" />;
}

export function Progress({
  value,
  label,
  tone = "brand",
}: {
  value: number;
  label?: string;
  tone?: "brand" | "teal";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-navy-100"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-out",
            tone === "teal" ? "bg-emerald-500" : "bg-brand-500",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label ? <p className="mt-1 text-xs text-navy-500">{label}</p> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="card-surface p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight", tone === "danger" ? "text-red-600" : "text-navy-950")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-navy-500">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------- tabs ---------------------------------- */

export function Tabs({
  items,
  current,
}: {
  items: { id: string; label: string; href: string; count?: number }[];
  current: string;
}) {
  return (
    <nav aria-label="Section navigation" className="mb-6 overflow-x-auto">
      <div className="flex min-w-max gap-1.5 rounded-full border border-navy-200/70 bg-surface/70 p-1 shadow-card backdrop-blur">
        {items.map((item) => {
          const active = item.id === current;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200",
                active
                  ? "bg-brand-600 text-on-brand shadow-sm"
                  : "text-navy-600 hover:bg-navy-100/80 hover:text-navy-900",
              )}
            >
              {item.label}
              {typeof item.count === "number" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active ? "bg-white/20 text-white" : "bg-navy-100 text-navy-600",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-navy-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.href ? (
              <Link href={item.href} className="hover:text-navy-800 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="text-navy-700">{item.label}</span>
            )}
            {index < items.length - 1 ? <span aria-hidden="true">/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* --------------------------------- tables --------------------------------- */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn("border-b border-navy-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-navy-500", className)}>
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-navy-200 px-3 py-2.5 align-top text-[13px] text-navy-700", className)}>
      {children}
    </td>
  );
}

/* -------------------------------- pagination ------------------------------ */

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const build = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) query.set(key, value);
    }
    if (target > 1) query.set("page", String(target));
    const search = query.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-navy-200 px-5 py-3 text-[13px]">
      <span className="text-navy-500">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <ButtonLink href={build(page - 1)} variant="secondary" size="sm" rel="prev">
            Previous
          </ButtonLink>
        ) : null}
        {page < pages ? (
          <ButtonLink href={build(page + 1)} variant="secondary" size="sm" rel="next">
            Next
          </ButtonLink>
        ) : null}
      </div>
    </nav>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-navy-200", className)} />;
}

export function DefinitionList({ items }: { items: { term: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.term}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">{item.term}</dt>
          <dd className="mt-1 text-sm text-navy-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
