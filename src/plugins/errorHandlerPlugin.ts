// src/plugins/socket-error-handler.ts

import { FastifyInstance, FastifyPluginCallback } from "fastify";
import { fastifyPlugin } from "fastify-plugin";
import { Server, Socket } from "socket.io";
import { AppError } from "../utils/errorHandler";

/**
 * Optimized Fastify plugin to handle Socket.IO errors with performance in mind:
 * - Conditional debug logging based on environment
 * - Streamlined error handling with minimal overhead
 * - Efficient socket monitoring for critical events only
 * - Optimized for production workloads
 */
const socketErrorHandlerPlugin: FastifyPluginCallback = (
  fastify: FastifyInstance,
  options,
  done
) => {
  // Ensure Socket.IO instance is available
  if (!fastify.io) {
    fastify.log.error("Socket.IO instance not found on Fastify server");
    return done(new Error("Socket.IO instance not available"));
  }

  const io: Server = fastify.io;
  
  // Feature flags for performance optimization
  const isProd = process.env.NODE_ENV === 'production';
  const enableDebugLogs = !isProd;
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  // 1️⃣ Socket connection error handling
  io.on("connection", (socket: Socket) => {
    const socketId = socket.id;

    // Log new socket connections - keep this in all environments as it's important for audit
    fastify.log.info({
      event: "socket_connected",
      socketId,
      requestId: (socket as any).requestId,
      transport: socket.conn.transport.name,
      address: socket.handshake.address,
      // Reduce payload size in production
      ...(enableDebugLogs && { userAgent: socket.handshake.headers["user-agent"] }),
      timestamp: new Date().toISOString(),
    });

    // 2️⃣ Handle socket errors - critical, keep in all environments
    socket.on("error", (error) => {
      // Log socket-specific errors
      fastify.log.error({
        err: error,
        ...(enableDebugLogs && { stack: error.stack }),
        event: "socket_error",
        socketId,
        requestId: (socket as any).requestId,
        timestamp: new Date().toISOString(),
      });

      // Emit error back to client with normalized structure
      socket.emit("app:error", {
        message: error instanceof AppError ? error.message : "Internal server error",
        errorCode: error instanceof AppError ? error.errorCode : "SOCKET_ERROR",
        status: error instanceof AppError ? error.statusCode : 500,
        socketId,
        requestId: (socket as any).requestId,
      });
    });

    // 3️⃣ Handle disconnection - important for session tracking
    socket.on("disconnect", (reason) => {
      fastify.log.info({
        event: "socket_disconnected",
        socketId,
        requestId: (socket as any).requestId,
        reason,
        timestamp: new Date().toISOString(),
      });
    });

    // 4️⃣ Handle reconnection attempts - only in debug mode
    if (enableDebugLogs) {
      socket.on("reconnect_attempt", (attemptNumber) => {
        fastify.log.info({
          event: "socket_reconnect_attempt",
          socketId,
          requestId: (socket as any).requestId,
          attemptNumber,
          timestamp: new Date().toISOString(),
        });
      });
    }
  });

  // 5️⃣ Global Socket.IO error handler - critical for all environments
  io.engine.on("connection_error", (err) => {
    fastify.log.error({
      err,
      ...(enableDebugLogs && { stack: err?.stack }),
      event: "socket_connection_error",
      timestamp: new Date().toISOString(),
      requestId: err?.req?.requestId,
    });
  });

  // 6️⃣ Add middleware to track event performance - only in non-production
  if (enableDebugLogs) {
    io.use((socket, next) => {
      // Create a more efficient middleware for event tracking
      socket.onAny((event, ...args) => {
        const startTime = process.hrtime();
        
        // Log event start
        fastify.log.debug({
          event: "socket_event_start",
          socketId: socket.id,
          requestId: (socket as any).requestId,
          socketEvent: event,
          timestamp: new Date().toISOString(),
        });
        
        // Check if the last argument is a function (acknowledgment)
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'function') {
          // Replace the callback to measure completion time accurately
          const originalCallback = args[args.length - 1];
          args[args.length - 1] = (...callbackArgs: any[]) => {
            // Log event completion with accurate timing
            const hrDuration = process.hrtime(startTime);
            const durationMs = hrDuration[0] * 1000 + hrDuration[1] / 1000000;
            
            fastify.log.debug({
              event: "socket_event_end",
              socketId: socket.id,
              requestId: (socket as any).requestId,
              socketEvent: event,
              responseTime: durationMs.toFixed(2) + "ms",
              timestamp: new Date().toISOString(),
            });
            
            // Call the original callback
            originalCallback(...callbackArgs);
          };
        }
      });
      
      next();
    });
  }

  // 7️⃣ Lambda-specific optimizations
  if (isLambda) {
    // Log warm starts vs cold starts - useful in all environments
    const isWarmStart = !!process.env.LAMBDA_TASK_ROOT;
    fastify.log.info({
      event: isWarmStart ? "lambda_warm_start" : "lambda_cold_start",
      timestamp: new Date().toISOString(),
    });
  }

  // 8️⃣ Add custom error event for application errors - streamlined
  fastify.decorate("socketError", (socket: Socket, error: Error | AppError) => {
    // Log error details
    fastify.log.error({
      err: error,
      ...(enableDebugLogs && { stack: error.stack }),
      event: "socket_app_error",
      socketId: socket.id,
      requestId: (socket as any).requestId,
      timestamp: new Date().toISOString(),
    });

    // Send standardized error response
    socket.emit("app:error", {
      message: error instanceof AppError ? error.message : "Internal server error",
      errorCode: error instanceof AppError ? error.errorCode : "INTERNAL_ERROR",
      status: error instanceof AppError ? error.statusCode : 500,
      socketId: socket.id,
      requestId: (socket as any).requestId,
    });
  });

  done();
};

// Export the Fastify plugin so it can be used in the main application
export default fastifyPlugin(socketErrorHandlerPlugin, {
  name: "socketErrorHandler",
  dependencies: ["fastify-socket.io"],
});