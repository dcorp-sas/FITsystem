import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function ok<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({ data });
}

export function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({
      error: httpName(error.statusCode),
      message: error.message,
      details: error.details,
    });
  }
  console.error('[api] unexpected error', error);
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: 'Ocurrio un error inesperado',
  });
}

function httpName(status: number): string {
  switch (status) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable Entity';
    default:
      return 'Error';
  }
}

/** Parsea body con zod, lanza HttpError 400 si falla. */
export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Datos invalidos', result.error.issues);
  }
  return result.data;
}

export interface AuthedRequest extends FastifyRequest {
  user: {
    id: string;
    organizationId: string;
    branchId: string | null;
    name: string;
    email: string;
    role: string;
  };
}

export interface PortalAuthedRequest extends FastifyRequest {
  portalAccount: {
    id: string;
    organizationId: string;
    memberId: string;
  };
}