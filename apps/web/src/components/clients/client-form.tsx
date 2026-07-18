"use client";

import { type CreateClientInput, createClientSchema } from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { ClientActionResult } from "@/app/(crm)/crm/clients/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const NAME_ID = "client-name";
const WHATSAPP_ID = "client-whatsapp";
const BIRTHDAY_ID = "client-birthday";
const SKIN_TONE_ID = "client-skin-tone";
const NOTES_ID = "client-notes";

const NAME_LABEL = "Nome";
const WHATSAPP_LABEL = "WhatsApp";
const BIRTHDAY_LABEL = "Aniversário";
const SKIN_TONE_LABEL = "Tom de pele";
const NOTES_LABEL = "Observações";

const OPTIONAL_HINT = "(opcional)";
const SUBMITTING_LABEL = "Salvando...";

// Empty string do input opcional vira `undefined` ANTES da validação: um campo em
// branco não deve falhar a checagem de data ISO. Reusa os schemas de campo do
// contrato compartilhado (core.md: nunca duplicar contrato) — o input externo de
// cada campo permanece `string`, então os valores do RHF seguem controlados.
// Retorno tipado com `null` (além de `undefined`) só para casar a variância do
// `.pipe` do Zod com os campos `nullable` do contrato; em runtime um campo vazio
// sempre vira `undefined` (o mapeamento para `null` no EDIT é feito em `buildPayload`).
const emptyToUndefined = (value: string): string | null | undefined =>
  value.trim().length === 0 ? undefined : value;

const clientFormSchema = z.object({
  name: createClientSchema.shape.name,
  whatsapp: createClientSchema.shape.whatsapp,
  birthday: z
    .string()
    .transform(emptyToUndefined)
    .pipe(createClientSchema.shape.birthday),
  skinTone: z
    .string()
    .transform(emptyToUndefined)
    .pipe(createClientSchema.shape.skinTone),
  notes: z
    .string()
    .transform(emptyToUndefined)
    .pipe(createClientSchema.shape.notes),
});

// Input (z.input): todos os campos são `string` (inputs controlados desde o
// primeiro render). Output (z.output): opcionais viram `string | undefined`.
type ClientFormFieldValues = z.input<typeof clientFormSchema>;
type ClientFormValues = z.output<typeof clientFormSchema>;

const EMPTY_VALUES: ClientFormFieldValues = {
  name: "",
  whatsapp: "",
  birthday: "",
  skinTone: "",
  notes: "",
};

export type ClientFormMode = "create" | "edit";

export type ClientFormProps = {
  mode: ClientFormMode;
  submitLabel: string;
  onSubmit: (values: CreateClientInput) => Promise<ClientActionResult>;
  defaultValues?: Partial<ClientFormFieldValues>;
};

// Monta o payload enviado à action. No EDIT, opcionais vazios (undefined) viram
// `null` explícito para LIMPAR o campo no PATCH (decisão do plan); no CREATE, os
// vazios permanecem `undefined` e são omitidos do corpo.
const buildPayload = (
  mode: ClientFormMode,
  values: ClientFormValues,
): CreateClientInput => {
  if (mode === "edit") {
    return {
      name: values.name,
      whatsapp: values.whatsapp,
      birthday: values.birthday ?? null,
      skinTone: values.skinTone ?? null,
      notes: values.notes ?? null,
    };
  }
  return {
    name: values.name,
    whatsapp: values.whatsapp,
    birthday: values.birthday,
    skinTone: values.skinTone,
    notes: values.notes,
  };
};

// Form de cliente (Client Component, folha da árvore): reusado em cadastro e
// edição. RHF + zodResolver com o contrato compartilhado (mesma validação da API).
// Estados de web.md: enviando (botão desabilitado + "Salvando...") e erro do
// servidor (mensagem pt-BR em `role="alert"`); erros de campo em pt-BR sob cada
// input. A action passada pela page redireciona (create) ou revalida (edit).
export function ClientForm({
  mode,
  submitLabel,
  onSubmit,
  defaultValues,
}: ClientFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormFieldValues, unknown, ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  });

  const submit = (values: ClientFormValues) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await onSubmit(buildPayload(mode, values));
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  const nameError = errors.name?.message;
  const whatsappError = errors.whatsapp?.message;
  const birthdayError = errors.birthday?.message;
  const skinToneError = errors.skinTone?.message;
  const notesError = errors.notes?.message;

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={NAME_ID}>{NAME_LABEL}</Label>
        <Input
          id={NAME_ID}
          type="text"
          autoComplete="name"
          className="h-11 md:h-9"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${NAME_ID}-error` : undefined}
          {...register("name")}
        />
        {nameError ? (
          <p id={`${NAME_ID}-error`} className="text-sm text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={WHATSAPP_ID}>{WHATSAPP_LABEL}</Label>
        <Input
          id={WHATSAPP_ID}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          className="h-11 md:h-9"
          aria-invalid={whatsappError ? true : undefined}
          aria-describedby={whatsappError ? `${WHATSAPP_ID}-error` : undefined}
          {...register("whatsapp")}
        />
        {whatsappError ? (
          <p id={`${WHATSAPP_ID}-error`} className="text-sm text-destructive">
            {whatsappError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={BIRTHDAY_ID}>
          {BIRTHDAY_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Input
          id={BIRTHDAY_ID}
          type="date"
          autoComplete="bday"
          className="h-11 md:h-9"
          aria-invalid={birthdayError ? true : undefined}
          aria-describedby={birthdayError ? `${BIRTHDAY_ID}-error` : undefined}
          {...register("birthday")}
        />
        {birthdayError ? (
          <p id={`${BIRTHDAY_ID}-error`} className="text-sm text-destructive">
            {birthdayError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={SKIN_TONE_ID}>
          {SKIN_TONE_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Input
          id={SKIN_TONE_ID}
          type="text"
          className="h-11 md:h-9"
          aria-invalid={skinToneError ? true : undefined}
          aria-describedby={skinToneError ? `${SKIN_TONE_ID}-error` : undefined}
          {...register("skinTone")}
        />
        {skinToneError ? (
          <p id={`${SKIN_TONE_ID}-error`} className="text-sm text-destructive">
            {skinToneError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={NOTES_ID}>
          {NOTES_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Textarea
          id={NOTES_ID}
          rows={4}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? `${NOTES_ID}-error` : undefined}
          {...register("notes")}
        />
        {notesError ? (
          <p id={`${NOTES_ID}-error`} className="text-sm text-destructive">
            {notesError}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="h-11 w-full text-base md:w-auto md:self-start md:px-6"
      >
        {isPending ? SUBMITTING_LABEL : submitLabel}
      </Button>
    </form>
  );
}
