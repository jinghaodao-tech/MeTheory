export interface CreateUserRequest {
  authSubject: string;
  locale?: string;
  timezone?: string;
}

export interface CreateBeliefRequest {
  userId: string;
  statement: string;
}

export interface CreateHypothesisRequest {
  userId: string;
  selfBeliefId?: string;
  statement: string;
  templateKey: string;
  spec?: unknown;
}

export interface ResponseRequest {
  idempotencyKey: string;
  clientCreatedAt?: string;
  outcome?: string;
  activityType?: string;
  missingReason?: string;
}
export * from './ai.ts';
export * from './mcp.ts';
