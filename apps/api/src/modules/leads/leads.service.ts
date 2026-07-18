import type {
  LeadCaptureRequest,
  LeadCaptureResponse,
} from "@clientela/shared";

export type LeadsClock = () => Date;
export type GenerateId = () => string;

// Porta mínima que o service precisa do repositório — o service não conhece
// Drizzle nem o schema do banco (api.md: dependências explícitas, testável
// com fake, sem mock de módulo).
export type LeadsRepositoryPort = {
  insert: (lead: {
    name: string;
    whatsapp: string;
    interest?: string;
    consentAt: Date;
  }) => Promise<{ id: string }>;
};

export type LeadsServiceDeps = {
  repository: LeadsRepositoryPort;
  clock: LeadsClock;
  generateId: GenerateId;
};

export type LeadsService = ReturnType<typeof createLeadsService>;

const isHoneypotTriggered = (website: string | undefined): boolean =>
  website !== undefined && website.length > 0;

export const createLeadsService = ({
  repository,
  clock,
  generateId,
}: LeadsServiceDeps) => {
  const capture = async (
    input: LeadCaptureRequest,
  ): Promise<LeadCaptureResponse> => {
    // Honeypot: `website` não-vazio = bot. Responde 201 com id sintético, sem
    // persistir e sem revelar a detecção. `website` ausente ou "" (campo hidden
    // do formulário HTML) é humano e segue o fluxo normal. Nada é logado aqui:
    // dado pessoal não entra em log (security.md).
    if (isHoneypotTriggered(input.website)) {
      return { id: generateId() };
    }

    const inserted = await repository.insert({
      name: input.name,
      whatsapp: input.whatsapp,
      interest: input.interest,
      consentAt: clock(),
    });

    return { id: inserted.id };
  };

  return { capture };
};
