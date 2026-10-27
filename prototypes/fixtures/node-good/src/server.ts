import Fastify from "fastify";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply
      .status(500)
      .send({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });

  return app;
}
