import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { loadWebEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type ButtonVariant = NonNullable<
  Parameters<typeof buttonVariants>[0]
>["variant"];
type ButtonSize = NonNullable<Parameters<typeof buttonVariants>[0]>["size"];

export type WhatsAppCtaProps = {
  children: ReactNode;
  message?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  ariaLabel?: string;
};

// Server Component: monta o link wa.me em build/servidor a partir da env validada.
// A prop `message` sobrepõe a mensagem default da config (reuso no LP-05 por produto).
// `ariaLabel` dá nome acessível ao link (RF-05: inclui o produto no catálogo).
export function WhatsAppCta({
  children,
  message,
  variant = "default",
  size = "default",
  className,
  ariaLabel,
}: WhatsAppCtaProps) {
  const env = loadWebEnv();
  const href = buildWhatsAppUrl({
    phone: env.WHATSAPP_PHONE,
    message: message ?? env.WHATSAPP_DEFAULT_MESSAGE,
  });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children}
    </a>
  );
}
