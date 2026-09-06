import type {
  IRefreshSessionRepository,
  RefreshSessionRotation,
} from '../../domain/repositories/IRefreshSessionRepository.js'
import type { PrismaContext } from '../database/prismaContext.js'

/**
 * Una actualizacion condicional consume el token vigente y publica el siguiente.
 * La base decide el ganador: dos refresh concurrentes nunca pueden rotar la
 * misma fila desde el mismo identificador.
 */
export function createPrismaRefreshSessionRepository(
  context: PrismaContext,
): IRefreshSessionRepository {
  const { executor } = context

  return {
    async create(session) {
      await executor.refreshSession.create({ data: session })
    },

    async rotate(command): Promise<RefreshSessionRotation> {
      const consumed = await executor.refreshSession.updateMany({
        where: {
          id: command.sessionId,
          userId: command.userId,
          currentTokenId: command.currentTokenId,
          revokedAt: null,
          expiresAt: { gt: command.now },
          user: {
            active: true,
            deletedAt: null,
            tokenVersion: command.tokenVersion,
          },
        },
        data: {
          currentTokenId: command.nextTokenId,
          expiresAt: command.expiresAt,
        },
      })

      if (consumed.count === 1) return 'rotated'

      // Si la familia existe pero ya avanzo a otro token, el presentado es un
      // predecesor reutilizado. Revocar solo esta fila preserva otros dispositivos.
      const revoked = await executor.refreshSession.updateMany({
        where: {
          id: command.sessionId,
          userId: command.userId,
          currentTokenId: { not: command.currentTokenId },
          revokedAt: null,
        },
        data: { revokedAt: command.now },
      })

      return revoked.count === 1 ? 'reused' : 'invalid'
    },

    async revoke(sessionId) {
      const revoked = await executor.refreshSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      return revoked.count === 1
    },
  }
}
