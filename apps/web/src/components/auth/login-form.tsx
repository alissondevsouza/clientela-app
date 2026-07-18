"use client";

import {
  type LoginRequest,
  type LoginRequestInput,
  loginRequestSchema,
} from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { loginAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_ID = "login-email";
const PASSWORD_ID = "login-password";

const EMAIL_LABEL = "E-mail";
const PASSWORD_LABEL = "Senha";
const SUBMIT_LABEL = "Entrar";
const SUBMITTING_LABEL = "Entrando...";

// Valores default do form (LoginRequestInput = z.input): campos controlados desde
// o primeiro render (evita warning de input não-controlado → controlado).
const DEFAULT_VALUES: LoginRequestInput = {
  email: "",
  password: "",
};

// Componente client (folha da árvore): a página `/login` permanece RSC. RHF com o
// schema do CONTRATO COMPLETO (`loginRequestSchema` — lesson zodResolver: o parse
// strippa chaves fora do schema, então o schema do form é o do contrato). Estados
// (web.md): enviando (botão desabilitado + "Entrando...") e erro do servidor
// (mensagem pt-BR da action em área role="alert"). A action redireciona no sucesso.
export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequestInput, unknown, LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const onSubmit = (values: LoginRequest) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await loginAction(values);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  const emailError = errors.email?.message;
  const passwordError = errors.password?.message;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4 text-left"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={EMAIL_ID}>{EMAIL_LABEL}</Label>
        <Input
          id={EMAIL_ID}
          type="email"
          inputMode="email"
          autoComplete="email"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${EMAIL_ID}-error` : undefined}
          {...register("email")}
        />
        {emailError ? (
          <p id={`${EMAIL_ID}-error`} className="text-sm text-destructive">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={PASSWORD_ID}>{PASSWORD_LABEL}</Label>
        <Input
          id={PASSWORD_ID}
          type="password"
          autoComplete="current-password"
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? `${PASSWORD_ID}-error` : undefined}
          {...register("password")}
        />
        {passwordError ? (
          <p id={`${PASSWORD_ID}-error`} className="text-sm text-destructive">
            {passwordError}
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
        {isPending ? SUBMITTING_LABEL : SUBMIT_LABEL}
      </Button>
    </form>
  );
}
