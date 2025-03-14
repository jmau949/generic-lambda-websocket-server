import { FastifyInstance, FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import * as Sentry from "@sentry/aws-serverless";
import { Server as SocketIOServer } from "socket.io";

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

const socketErrorMonitoringPlugin: FastifyPluginCallback = (
  fastify: FastifyInstance,
  options,
  done
) => {
  // Skip initializing Sentry in test environment
  if (process.env.NODE_ENV === "test") {
    fastify.log.info("Skipping Sentry initialization in test environment");
    return done();
  }

  if (!process.env.SENTRY_DSN) {
    fastify.log.warn("SENTRY_DSN is not set. Sentry monitoring is disabled.");
    return done();
  }

  // We're in a Lambda environment - use Lambda-specific settings
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0.3,
    // Lambda-specific settings
    serverName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    // Better for Lambda environment - only send critical data
    beforeSend(event, hint) {
      // Filter out non-critical events in production to reduce costs
      if (
        process.env.NODE_ENV === "production" &&
        event.level !== "error" &&
        event.level !== "fatal"
      ) {
        return null;
      }
      return event;
    },
    // Set release version if available
    release: process.env.VERSION || process.env.AWS_LAMBDA_FUNCTION_VERSION,
  });

  fastify.log.info("✅ Sentry is initialized for Socket.IO monitoring");

  // Set up Socket.IO monitoring when server is ready
  fastify.addHook("onReady", () => {
    // Make sure io is available on the fastify instance
    if (!fastify.io) {
      fastify.log.error("Socket.IO instance not found on fastify instance");
      return;
    }

    const io: SocketIOServer = fastify.io;

    // Monitor socket connections
    io.on("connection", (socket) => {
      // Set socket ID as a tag for easier debugging
      Sentry.setTag("socketId", socket.id);

      // Set user data if available
      if (socket.data && socket.data.userId) {
        Sentry.setUser({
          id: socket.data.userId,
        });
      }

      // Monitor socket errors
      socket.on("error", (error) => {
        Sentry.captureException(error, {
          tags: {
            socketId: socket.id,
          },
        });
      });

      // Track disconnections
      socket.on("disconnect", (reason) => {
        Sentry.setTag("disconnectReason", reason);
      });
    });

    // Monitor global Socket.IO server errors
    io.engine.on("connection_error", (err) => {
      Sentry.captureException(err, {
        tags: {
          type: "socketio.connection_error",
        },
      });
    });
  });

  // Capture any fastify-level errors
  fastify.addHook("onError", (request, reply, error, done) => {
    Sentry.captureException(error, {
      tags: {
        type: "server.error",
      },
    });
    done();
  });

  // Flush Sentry events when the server closes
  fastify.addHook("onClose", (instance, done) => {
    // For Lambda environments, set a shorter timeout
    const flushTimeout = process.env.AWS_LAMBDA_FUNCTION_NAME ? 1250 : 5000;
    Sentry.flush(flushTimeout)
      .then(() => done())
      .catch(() => done());
  });

  done();
};

export default fp(socketErrorMonitoringPlugin);
