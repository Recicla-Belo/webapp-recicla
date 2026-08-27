import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { usuarioUuid: string; email: string; administrador: boolean; versaoSessao: number };
    user: { usuarioUuid: string; email: string; administrador: boolean; versaoSessao: number };
  }
}
