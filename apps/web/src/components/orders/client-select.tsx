"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type {
  OrderFormClient,
  SearchClientsResult,
} from "@/app/(crm)/crm/orders/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NONE_VALUE = "";
const NONE_OPTION_LABEL = "Reposição (sem cliente)";
const SEARCH_LABEL = "Buscar cliente";
const SEARCH_PLACEHOLDER = "Digite o nome da cliente";
const SEARCHING_HINT = "Buscando...";
const SEARCH_DEBOUNCE_MS = 300;

const SELECT_CLASS_NAME =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-9 md:text-sm";

export type ClientSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (clientId: string) => void;
  clients: OrderFormClient[];
  searchClientsAction: (term: string) => Promise<SearchClientsResult>;
};

// Mescla a lista de clientes recebida (inicial do RSC + recém-criadas pelo
// cadastro rápido, já combinadas pelo form pai) com os resultados da busca
// digitada. `Map` por id remove duplicatas (a mesma cliente pode vir das duas
// fontes) sem perder entradas; ordenado por nome (pt-BR) para navegação
// previsível no `<select>`.
const mergeClients = (
  clients: OrderFormClient[],
  searchResults: OrderFormClient[],
): OrderFormClient[] => {
  const merged = new Map<string, OrderFormClient>();
  for (const client of clients) {
    merged.set(client.id, client);
  }
  for (const client of searchResults) {
    merged.set(client.id, client);
  }
  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
};

// Seletor de cliente por item do pedido (RF-05): default "Reposição (sem
// cliente)"; busca digitada com debounce (~300ms) chamando `searchClientsAction`
// — referência DIRETA da Server Action recebida por prop (lesson 2026-07-19,
// closures adaptadores não atravessam a fronteira RSC→client) — dentro de
// `useTransition`. A prop `clients` já traz a lista inicial do RSC mesclada
// com as clientes recém-criadas pelo cadastro rápido (estado do form pai);
// este componente soma só os resultados da busca digitada.
export function ClientSelect({
  id,
  label,
  value,
  onChange,
  clients,
  searchClientsAction,
}: ClientSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<OrderFormClient[]>([]);
  const [isSearching, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  const options = useMemo(
    () => mergeClients(clients, searchResults),
    [clients, searchResults],
  );

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (term.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await searchClientsAction(term);
        if (result.ok) {
          setSearchResults(result.clients);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const searchFieldId = `${id}-search`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={searchFieldId}>{SEARCH_LABEL}</Label>
      <Input
        id={searchFieldId}
        type="text"
        placeholder={SEARCH_PLACEHOLDER}
        value={searchTerm}
        onChange={(event) => handleSearchChange(event.target.value)}
        className="h-11 md:h-9"
      />
      {isSearching ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {SEARCHING_HINT}
        </p>
      ) : null}

      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS_NAME}
      >
        <option value={NONE_VALUE}>{NONE_OPTION_LABEL}</option>
        {options.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </div>
  );
}
