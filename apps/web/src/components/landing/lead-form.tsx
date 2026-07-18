"use client";

import {
  type LeadFormInput,
  type LeadFormValues,
  leadFormSchema,
} from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { submitLeadAction } from "@/app/(landing)/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeadFormContent, LeadSuccessContent } from "@/content/landing";

const INTEREST_MAX_LENGTH = 500;

const NAME_ID = "lead-name";
const WHATSAPP_ID = "lead-whatsapp";
const INTEREST_ID = "lead-interest";
const CONSENT_ID = "lead-consent";
const HONEYPOT_ID = "lead-website";

const DEFAULT_VALUES: LeadFormInput = {
  name: "",
  whatsapp: "",
  interest: "",
  consent: false,
  website: "",
};

export type LeadFormProps = {
  content: LeadFormContent;
  success: LeadSuccessContent;
};

// Componente client (folha da árvore): a página permanece RSC estática. RHF com
// o schema compartilhado (mesma validação do front e da API). Estados obrigatórios
// (web.md): enviando, sucesso (substitui o form) e erro (mensagem + retry com os
// valores preservados). Honeypot `website` off-screen — bot preenchendo recebe o
// mesmo fluxo de sucesso (a API devolve 201 sintético).
export function LeadForm({ content, success }: LeadFormProps) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LeadFormInput, unknown, LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const onSubmit = (values: LeadFormValues) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await submitLeadAction(values);
      if (result.ok) {
        setSubmitted(true);
        return;
      }
      setErrorMessage(result.message);
    });
  };

  if (submitted) {
    return (
      <div
        role="status"
        className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center"
      >
        <p className="text-lg font-semibold">{success.title}</p>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          {success.description}
        </p>
      </div>
    );
  }

  const nameError = errors.name?.message;
  const whatsappError = errors.whatsapp?.message;
  const interestError = errors.interest?.message;
  const consentError = errors.consent?.message;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4 text-left"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={NAME_ID}>{content.nameLabel}</Label>
        <Input
          id={NAME_ID}
          autoComplete="name"
          placeholder={content.namePlaceholder}
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
        <Label htmlFor={WHATSAPP_ID}>{content.whatsappLabel}</Label>
        <Input
          id={WHATSAPP_ID}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={content.whatsappPlaceholder}
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
        <Label htmlFor={INTEREST_ID}>{content.interestLabel}</Label>
        <Textarea
          id={INTEREST_ID}
          rows={3}
          maxLength={INTEREST_MAX_LENGTH}
          placeholder={content.interestPlaceholder}
          aria-invalid={interestError ? true : undefined}
          aria-describedby={interestError ? `${INTEREST_ID}-error` : undefined}
          {...register("interest")}
        />
        {interestError ? (
          <p id={`${INTEREST_ID}-error`} className="text-sm text-destructive">
            {interestError}
          </p>
        ) : null}
      </div>

      {/* Honeypot anti-bot: input de texto REAL fora da tela e da ordem de
          tabulação; escondido de leitores de tela. Humanos não veem/preenchem. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      >
        <Label htmlFor={HONEYPOT_ID}>{content.honeypotLabel}</Label>
        <Input
          id={HONEYPOT_ID}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="consent"
            render={({ field }) => (
              <Checkbox
                id={CONSENT_ID}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked)}
                onBlur={field.onBlur}
                aria-invalid={consentError ? true : undefined}
                aria-describedby={
                  consentError ? `${CONSENT_ID}-error` : undefined
                }
                className="mt-0.5"
              />
            )}
          />
          <Label
            htmlFor={CONSENT_ID}
            className="text-sm font-normal leading-snug"
          >
            {content.consentLabel}
          </Label>
        </div>
        {consentError ? (
          <p id={`${CONSENT_ID}-error`} className="text-sm text-destructive">
            {consentError}
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
        className="h-11 w-full text-base"
      >
        {isPending
          ? content.submittingLabel
          : errorMessage
            ? content.retryLabel
            : content.submitLabel}
      </Button>
    </form>
  );
}
