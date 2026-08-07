"use client";

import {
  type CreateClientInput,
  type CreateLeadCrmInput,
  createClientSchema,
  createLeadCrmSchema,
} from "@clientela/shared";
import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  AppointmentFormPerson,
  QuickCreateClientResult,
  QuickCreateLeadResult,
  SearchClientsResult,
  SearchLeadsResult,
} from "@/app/(crm)/crm/appointments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeSearchHasNoResults } from "@/lib/appointment-person-search";

const SEARCH_DEBOUNCE_MS = 300;

const GROUP_LABEL = "Pessoa vinculada";
const CLIENT_TAB_LABEL = "Cliente";
const LEAD_TAB_LABEL = "Lead";
const NONE_HINT = "Sem pessoa vinculada (opcional)";
const SEARCH_PLACEHOLDER_CLIENT = "Buscar cliente pelo nome";
const SEARCH_PLACEHOLDER_LEAD = "Buscar lead pelo nome";
const SEARCHING_TEXT = "Buscando...";
const SEARCH_ERROR_TEXT = "Não foi possível buscar agora. Tente novamente.";
const NO_RESULTS_TEXT = "Nenhum resultado encontrado.";
const REMOVE_LABEL = "Remover pessoa";

const CREATE_PERSON_CTA_LABEL = "Cadastrar pessoa";
const QUICK_NAME_LABEL = "Nome";
const QUICK_WHATSAPP_LABEL = "WhatsApp";
const QUICK_WHATSAPP_PLACEHOLDER = "(11) 91234-5678";
const CREATE_AS_CLIENT_LABEL = "Cadastrar como cliente";
const CREATE_AS_LEAD_LABEL = "Cadastrar como lead";
const CREATING_LABEL = "Cadastrando...";
const QUICK_CANCEL_LABEL = "Cancelar";

type PersonTab = "client" | "lead";

type SearchStatus = "idle" | "loading" | "error";

type SearchState = {
  status: SearchStatus;
  results: AppointmentFormPerson[];
};

const IDLE_STATE: SearchState = { status: "idle", results: [] };

type SearchFetchResult =
  | { ok: true; results: AppointmentFormPerson[] }
  | { ok: false };

export type PersonSelectValue = {
  clientId: string | null;
  clientName: string;
  leadId: string | null;
  leadName: string;
};

export const EMPTY_PERSON_SELECT_VALUE: PersonSelectValue = {
  clientId: null,
  clientName: "",
  leadId: null,
  leadName: "",
};

export type PersonSelectProps = {
  id: string;
  value: PersonSelectValue;
  onChange: (value: PersonSelectValue) => void;
  searchClientsAction: (term: string) => Promise<SearchClientsResult>;
  searchLeadsAction: (term: string) => Promise<SearchLeadsResult>;
  quickCreateClientAction: (
    values: CreateClientInput,
  ) => Promise<QuickCreateClientResult>;
  quickCreateLeadAction: (
    values: CreateLeadCrmInput,
  ) => Promise<QuickCreateLeadResult>;
};

// Busca debounced (300ms) de UMA aba (cliente OU lead). `fetcher` é a Server
// Action recebida por prop como referência DIRETA (lesson 2026-07-19) —
// adaptada aqui para um shape único `{ ok, results }`, sem envolvê-la num
// closure antes de atravessar a fronteira RSC→client (a adaptação acontece
// DENTRO do client component, nunca no RSC pai). `active` descarta respostas
// de buscas obsoletas (o termo mudou antes da resposta anterior chegar).
function usePersonSearch(
  fetcher: (term: string) => Promise<SearchFetchResult>,
): {
  term: string;
  setTerm: (value: string) => void;
  state: SearchState;
} {
  const [term, setTerm] = useState("");
  const [state, setState] = useState<SearchState>(IDLE_STATE);

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length === 0) {
      setState(IDLE_STATE);
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, status: "loading" }));
    const timer = setTimeout(async () => {
      const result = await fetcher(trimmed);
      if (!active) {
        return;
      }
      setState(
        result.ok
          ? { status: "idle", results: result.results }
          : { status: "error", results: [] },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, fetcher]);

  return { term, setTerm, state };
}

// Resultados da busca abaixo do input: carregando/erro/vazio (web.md) mais a
// lista clicável — opções são botões reais (navegáveis por teclado, alvo de
// toque amplo).
function SearchResultsList({
  state,
  onSelect,
}: {
  state: SearchState;
  onSelect: (person: AppointmentFormPerson) => void;
}) {
  if (state.status === "loading") {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {SEARCHING_TEXT}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {SEARCH_ERROR_TEXT}
      </p>
    );
  }
  if (state.results.length === 0) {
    return <p className="text-sm text-muted-foreground">{NO_RESULTS_TEXT}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 rounded-lg bg-muted/40 p-1">
      {state.results.map((person) => (
        <li key={person.id}>
          <button
            type="button"
            onClick={() => onSelect(person)}
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            {person.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

type QuickCreatePersonFormProps = {
  id: string;
  initialName: string;
  onCreated: (kind: PersonTab, person: AppointmentFormPerson) => void;
  onCancel: () => void;
  quickCreateClientAction: (
    values: CreateClientInput,
  ) => Promise<QuickCreateClientResult>;
  quickCreateLeadAction: (
    values: CreateLeadCrmInput,
  ) => Promise<QuickCreateLeadResult>;
};

// Cadastro rápido de pessoa direto do seletor (RF-23): abre quando a busca
// não acha ninguém, com nome (pré-preenchido pelo termo buscado) e WhatsApp —
// a consultora ESCOLHE se a pessoa nasce cliente ou lead, cada botão valida
// com o schema compartilhado correspondente (`safeParse` ANTES de qualquer
// chamada — WhatsApp inválido vira erro de campo, nada é criado) e chama a
// Server Action correspondente. Este componente já vive DENTRO do `<form>`
// de `AppointmentForm` (mesmo dilema de `quick-client-form.tsx`), por isso é
// PROIBIDO um `<form>` aninhado: inputs controlados + botões `type="button"`.
function QuickCreatePersonForm({
  id,
  initialName,
  onCreated,
  onCancel,
  quickCreateClientAction,
  quickCreateLeadAction,
}: QuickCreatePersonFormProps) {
  const [name, setName] = useState(initialName);
  const [whatsapp, setWhatsapp] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<PersonTab | null>(null);
  const [isPending, startTransition] = useTransition();

  // `initialName` só alimenta o `useState` na MONTAGEM (SUGESTÃO da revisão
  // de `crm-appointments`): sem este efeito, corrigir o termo de busca com o
  // mini-form aberto não atualiza o campo Nome enquanto o componente
  // continuar montado. Sincroniza explicitamente sempre que o termo buscado
  // mudar.
  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const nameId = `${id}-quick-name`;
  const whatsappId = `${id}-quick-whatsapp`;

  const submitAsClient = () => {
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

    setPendingKind("client");
    startTransition(async () => {
      const result = await quickCreateClientAction(parsed.data);
      setPendingKind(null);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      onCreated("client", result.client);
    });
  };

  const submitAsLead = () => {
    setFormError(null);
    setNameError(null);
    setWhatsappError(null);

    const parsed = createLeadCrmSchema.safeParse({ name, whatsapp });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setNameError(fieldErrors.name?.[0] ?? null);
      setWhatsappError(fieldErrors.whatsapp?.[0] ?? null);
      return;
    }

    setPendingKind("lead");
    startTransition(async () => {
      const result = await quickCreateLeadAction(parsed.data);
      setPendingKind(null);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      onCreated("lead", result.lead);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{QUICK_NAME_LABEL}</Label>
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
        <Label htmlFor={whatsappId}>{QUICK_WHATSAPP_LABEL}</Label>
        <Input
          id={whatsappId}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={QUICK_WHATSAPP_PLACEHOLDER}
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

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={submitAsClient}
        >
          {pendingKind === "client" ? CREATING_LABEL : CREATE_AS_CLIENT_LABEL}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={submitAsLead}
        >
          {pendingKind === "lead" ? CREATING_LABEL : CREATE_AS_LEAD_LABEL}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onCancel}
        >
          {QUICK_CANCEL_LABEL}
        </Button>
      </div>
    </div>
  );
}

// Seletor de pessoa do compromisso (RF-02/RF-18): cliente OU lead, nunca os
// dois — selecionar um SEMPRE limpa o outro (a mutualidade vive aqui dentro,
// não depende do chamador acertar). Sem pessoa selecionada é o estado padrão
// ("sem pessoa" — RF-02); o botão "Remover pessoa" volta explicitamente a
// esse estado a partir de uma seleção existente. Padrão visual de
// `client-select.tsx`/`sale-form.tsx`: chip com nome quando selecionado,
// busca textual com debounce quando não.
export function PersonSelect({
  id,
  value,
  onChange,
  searchClientsAction,
  searchLeadsAction,
  quickCreateClientAction,
  quickCreateLeadAction,
}: PersonSelectProps) {
  const [activeTab, setActiveTab] = useState<PersonTab>("client");
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

  const fetchClientResults = useCallback(
    async (term: string): Promise<SearchFetchResult> => {
      const result = await searchClientsAction(term);
      return result.ok ? { ok: true, results: result.clients } : { ok: false };
    },
    [searchClientsAction],
  );

  const fetchLeadResults = useCallback(
    async (term: string): Promise<SearchFetchResult> => {
      const result = await searchLeadsAction(term);
      return result.ok ? { ok: true, results: result.leads } : { ok: false };
    },
    [searchLeadsAction],
  );

  const clientSearch = usePersonSearch(fetchClientResults);
  const leadSearch = usePersonSearch(fetchLeadResults);

  const selectPerson = (tab: PersonTab, person: AppointmentFormPerson) => {
    clientSearch.setTerm("");
    leadSearch.setTerm("");
    onChange(
      tab === "client"
        ? {
            clientId: person.id,
            clientName: person.name,
            leadId: null,
            leadName: "",
          }
        : {
            clientId: null,
            clientName: "",
            leadId: person.id,
            leadName: person.name,
          },
    );
  };

  const clearPerson = () => {
    clientSearch.setTerm("");
    leadSearch.setTerm("");
    setIsQuickCreateOpen(false);
    onChange(EMPTY_PERSON_SELECT_VALUE);
  };

  // Cadastro concluído (RF-23): fecha o mini-form e vincula a pessoa recém-
  // criada exatamente como se tivesse sido escolhida na busca — reusa
  // `selectPerson` (mesma limpeza de termo + `onChange`), única fonte da
  // mutualidade cliente×lead.
  const handlePersonCreated = (
    kind: PersonTab,
    person: AppointmentFormPerson,
  ) => {
    setIsQuickCreateOpen(false);
    selectPerson(kind, person);
  };

  const groupLabelId = `${id}-group-label`;

  if (value.clientId !== null || value.leadId !== null) {
    const selectedName =
      value.clientId !== null ? value.clientName : value.leadName;
    const selectedKindLabel =
      value.clientId !== null ? CLIENT_TAB_LABEL : LEAD_TAB_LABEL;
    return (
      <div className="flex flex-col gap-1.5">
        <span id={groupLabelId} className="text-sm font-medium">
          {GROUP_LABEL}
        </span>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <span className="min-w-0 truncate text-sm">
            <span className="font-medium">{selectedName}</span>{" "}
            <span className="text-xs text-muted-foreground">
              ({selectedKindLabel})
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearPerson}
            className="h-11 shrink-0 md:h-9"
          >
            {REMOVE_LABEL}
          </Button>
        </div>
      </div>
    );
  }

  const activeSearch = activeTab === "client" ? clientSearch : leadSearch;
  const searchPlaceholder =
    activeTab === "client"
      ? SEARCH_PLACEHOLDER_CLIENT
      : SEARCH_PLACEHOLDER_LEAD;
  const searchInputId = `${id}-search`;

  // Gatilho do cadastro rápido (RF-23): só quando a busca REALMENTE terminou
  // sem achar ninguém (não durante carregamento/erro) — evita oferecer
  // "cadastrar" antes de a busca responder. Decisão extraída para `lib/`
  // (ALERTA da revisão de `crm-appointments`) e testada lá.
  const canOfferQuickCreate = activeSearchHasNoResults(
    activeSearch.term,
    activeSearch.state.status,
    activeSearch.state.results.length,
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span id={groupLabelId} className="text-sm font-medium">
        {GROUP_LABEL}
      </span>
      <div role="tablist" aria-labelledby={groupLabelId} className="flex gap-2">
        <Button
          type="button"
          variant={activeTab === "client" ? "default" : "outline"}
          size="sm"
          role="tab"
          aria-selected={activeTab === "client"}
          className="h-11 md:h-9"
          onClick={() => {
            setActiveTab("client");
            setIsQuickCreateOpen(false);
          }}
        >
          {CLIENT_TAB_LABEL}
        </Button>
        <Button
          type="button"
          variant={activeTab === "lead" ? "default" : "outline"}
          size="sm"
          role="tab"
          aria-selected={activeTab === "lead"}
          className="h-11 md:h-9"
          onClick={() => {
            setActiveTab("lead");
            setIsQuickCreateOpen(false);
          }}
        >
          {LEAD_TAB_LABEL}
        </Button>
      </div>

      <Label htmlFor={searchInputId} className="sr-only">
        {searchPlaceholder}
      </Label>
      <Input
        id={searchInputId}
        type="text"
        placeholder={searchPlaceholder}
        value={activeSearch.term}
        onChange={(event) => activeSearch.setTerm(event.target.value)}
        className="h-11 md:h-9"
      />

      {activeSearch.term.trim().length > 0 ? (
        <SearchResultsList
          state={activeSearch.state}
          onSelect={(person) => selectPerson(activeTab, person)}
        />
      ) : null}

      {canOfferQuickCreate ? (
        isQuickCreateOpen ? (
          <QuickCreatePersonForm
            id={id}
            initialName={activeSearch.term.trim()}
            onCreated={handlePersonCreated}
            onCancel={() => setIsQuickCreateOpen(false)}
            quickCreateClientAction={quickCreateClientAction}
            quickCreateLeadAction={quickCreateLeadAction}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsQuickCreateOpen(true)}
            className="h-11 w-fit gap-1.5 md:h-9"
          >
            <UserPlus className="size-4" aria-hidden />
            {CREATE_PERSON_CTA_LABEL}
          </Button>
        )
      ) : null}

      <p className="text-xs text-muted-foreground">{NONE_HINT}</p>
    </div>
  );
}
