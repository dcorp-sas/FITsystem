import type { FastifyInstance, preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    authenticatePortal: preHandlerHookHandler;
    requireRoles: (roles: string[]) => preHandlerHookHandler;
    scopeBranch: preHandlerHookHandler;
  }
}