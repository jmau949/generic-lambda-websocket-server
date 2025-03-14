// plugins/socketPlugin.ts
import { FastifyInstance } from "fastify";
import { Server as IOServer, Socket } from "socket.io";
import { socketAuthMiddleware } from "../middleware/socketAuth";
import corsConfig from "../config/corsConfig";

/**
 * Socket.io plugin for Fastify with authentication and request tracking.
 *
 * @param fastify - Fastify instance
 */
export default async function socketPlugin(fastify: FastifyInstance) {
  const env = (process.env.NODE_ENV as keyof typeof corsConfig) || "dev";
  // Create a new Socket.io instance attached to Fastify's underlying HTTP server.
  const io = new IOServer(fastify.server, {
    cors: corsConfig[env],
    // connectTimeout (Default: 45000ms)
    // Specifies how long (in ms) the client has to establish a connection before being considered as failed.
    // Recommended value: 5000ms (5s)
    // Reason: Since Lambda cold starts can introduce delays, a shorter timeout prevents clients from waiting indefinitely during failures but still allows some flexibility.
    connectTimeout: 6000,
    // pingTimeout (Default: 60000ms)
    // When a client does not respond to a ping within this timeout, the server closes the connection.
    // Recommended value: 25000ms (25s)
    // Reason: API Gateway has a default idle timeout of 29 seconds, and the round-trip latency for Lambda responses can vary. Keeping this slightly below 29s ensures the connection doesn't get dropped unexpectedly.
    pingTimeout: 25000,
    // pingInterval (Default: 25000ms)
    // This controls how often pings are sent from the server to the client to keep the connection alive.
    //     Recommended value: 10000ms (10s)
    // Reason: Since AWS Lambda is stateless and might scale down, we need frequent heartbeats to keep the connection active. A 10s interval helps maintain a responsive connection without excessive pings.
    pingInterval: 25000,
  });

  // Decorate Fastify with the Socket.io instance.
  fastify.decorate("io", io);

  // Apply authentication middleware
  io.use((socket, next) => socketAuthMiddleware(fastify, socket, next));

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    const requestId = (socket as any).requestId;

    // Create a logger with socket context
    const log = fastify.log.child({
      requestId,
      socketId: socket.id,
      userId: user.sub,
      event: "socket_activity",
    });

    // Listen for a custom event sent by the client.
    socket.on("customEvent", (data) => {
      log.info({ data }, "Received customEvent");

      // Emit a response back to the same socket.
      socket.emit("customResponse", {
        message: "Hello from Socket.io!!!!!!!",
        requestId, // Echo back the requestId for client correlation
      });
    });
  });
  // Register a hook to close all socket connections on server shutdown
  fastify.addHook("onClose", (instance, done) => {
    io.close();
    done();
  });
}
