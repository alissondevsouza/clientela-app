import { and, eq, lte } from "drizzle-orm";
import type { Database } from "../../db/client";
import { consultants, sessions } from "../../db/schema";
import type {
  AuthConsultantRecord,
  AuthSessionInput,
  SessionWithConsultant,
} from "./auth.service";

export type AuthRepository = ReturnType<typeof createAuthRepository>;

// Única camada que toca o banco (api.md / database.md). Retornos moldados na
// porta que o service espera — o service não conhece Drizzle nem o schema.
export const createAuthRepository = (db: Database) => {
  const findConsultantByEmail = async (
    email: string,
  ): Promise<AuthConsultantRecord | undefined> => {
    const [consultant] = await db
      .select({
        id: consultants.id,
        name: consultants.name,
        email: consultants.email,
        passwordHash: consultants.passwordHash,
      })
      .from(consultants)
      .where(eq(consultants.email, email))
      .limit(1);

    return consultant;
  };

  const insertSession = async (session: AuthSessionInput): Promise<void> => {
    await db.insert(sessions).values({
      consultantId: session.consultantId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
    });
  };

  // Join explícito (sem N+1): sessão + consultora pública numa única query.
  const findSessionWithConsultantByTokenHash = async (
    tokenHash: string,
  ): Promise<SessionWithConsultant | undefined> => {
    const [row] = await db
      .select({
        expiresAt: sessions.expiresAt,
        consultant: {
          id: consultants.id,
          name: consultants.name,
          email: consultants.email,
        },
      })
      .from(sessions)
      .innerJoin(consultants, eq(sessions.consultantId, consultants.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    return row;
  };

  const deleteSessionByTokenHash = async (tokenHash: string): Promise<void> => {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  };

  // Limpeza oportunista: remove só as sessões já expiradas desta consultora.
  const deleteExpiredSessions = async (
    consultantId: string,
    now: Date,
  ): Promise<void> => {
    await db
      .delete(sessions)
      .where(
        and(
          eq(sessions.consultantId, consultantId),
          lte(sessions.expiresAt, now),
        ),
      );
  };

  return {
    findConsultantByEmail,
    insertSession,
    findSessionWithConsultantByTokenHash,
    deleteSessionByTokenHash,
    deleteExpiredSessions,
  };
};
