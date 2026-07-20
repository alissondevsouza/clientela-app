"use client";

import { type CreateClientInput, createClientSchema } from "@clientela/shared";
import { useState, useTransition } from "react";
import type {
  OrderFormClient,
  QuickCreateClientResult,
} from "@/app/(crm)/crm/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NAME_LABEL = "Nome";
const WHATSAPP_LABEL = "WhatsApp";
const WHATSAPP_PLACEHOLDER = "(11) 91234-5678";
const CREATE_LABEL = "Cadastrar cliente";
const CANCEL_LABEL = "Cancelar";
const SUBMITTING_LABEL = "Cadastrando...";

export type QuickClientFormProps = {
  idPrefix: string;
  onCreated: (client: OrderFormClient) => void;
  onCancel: () => void;
  quickCreateClientAction: (
    values: CreateClientInput,
  ) => Promise<QuickCreateClientResult>;
};

// Cadastro rápido de cliente (RF-06): renderiza DENTRO do form de itens do
// pedido, por isso é PROIBIDO um `<form>` aninhado (HTML inválido, achado da
// revisão) — inputs controlados + botão `type="button"` que valida com
// `createClientSchema` (mesmo contrato do cadastro completo, `safeParse`
// client-side para erros de campo em pt-BR) antes de chamar a Server Action
// recebida por prop via `startTransition` (referência DIRETA — lesson
// 2026-07-19: um closure adaptador criado no RSC não atravessa a fronteira).
export function QuickClientForm({
  idPrefix,
  onCreated,
  onCancel,
  quickCreateClientAction,
}: QuickClientFormProps) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nameId = `${idPrefix}-quick-client-name`;
  const whatsappId = `${idPrefix}-quick-client-whatsapp`;

  const handleSubmit = () => {
    setFormError(null);
    setNameError(null);
    setWhatsappError(null);

    const parsed = createClientSchema.safeParse({ name, whatsapp });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setNameError(fieldErrors.name?.[0] ?? null);
      setWhatsappError(fieldErrors.whatsapp?.[0] ?? null);
      return;
    }

    startTransition(async () => {
      const result = await quickCreateClientAction(parsed.data);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setName("");
      setWhatsapp("");
      onCreated(result.client);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{NAME_LABEL}</Label>
        <Input
          id={nameId}
          type="text"
          autoComplete="name"
          className="h-11 md:h-9"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
        />
        {nameError ? (
          <p
            id={`${nameId}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={whatsappId}>{WHATSAPP_LABEL}</Label>
        <Input
          id={whatsappId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={WHATSAPP_PLACEHOLDER}
          className="h-11 md:h-9"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
          aria-invalid={whatsappError ? true : undefined}
          aria-describedby={whatsappError ? `${whatsappId}-error` : undefined}
        />
        {whatsappError ? (
          <p
            id={`${whatsappId}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {whatsappError}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={handleSubmit}
        >
          {isPending ? SUBMITTING_LABEL : CREATE_LABEL}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onCancel}
        >
          {CANCEL_LABEL}
        </Button>
      </div>
    </div>
  );
}
