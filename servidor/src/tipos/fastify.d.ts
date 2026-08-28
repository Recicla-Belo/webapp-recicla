import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { usuarioUuid: string; email: string; administrador: boolean; perfil: "administrador" | "operador_cadastro"; versaoSessao: number };
    user: { usuarioUuid: string; email: string; administrador: boolean; perfil: "administrador" | "operador_cadastro"; versaoSessao: number };
  }
}
