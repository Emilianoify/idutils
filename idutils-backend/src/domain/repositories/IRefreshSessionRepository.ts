export interface NewRefreshSession {
  id: string
  userId: string
  currentTokenId: string
  expiresAt: Date
}

export interface RotateRefreshSessionCommand {
  sessionId: string
  userId: string
  currentTokenId: string
  nextTokenId: string
  tokenVersion: number
  expiresAt: Date
  now: Date
}

export type RefreshSessionRotation = 'rotated' | 'reused' | 'invalid'

export interface IRefreshSessionRepository {
  create(session: NewRefreshSession): Promise<void>
  rotate(command: RotateRefreshSessionCommand): Promise<RefreshSessionRotation>
  revoke(sessionId: string): Promise<boolean>
}
