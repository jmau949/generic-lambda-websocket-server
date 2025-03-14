// middleware/socketAuth.ts
import { FastifyInstance } from "fastify";
import { Socket } from "socket.io";
import { authenticateFromCookie } from "../plugins/auth";
import { getCookie } from "../utils/cookie";
import { v4 as uuidv4 } from "uuid";
import config from "../config/config";

/**
 * Socket.io authentication middleware
 * Extracts and validates the JWT token from cookies
 * Attaches user info and request ID to the socket
 */
export async function socketAuthMiddleware(
  fastify: FastifyInstance,
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    // Get request ID from headers or generate a new one
    const requestId =
      (socket.handshake.headers["x-request-id"] as string) || uuidv4();

    // Store requestId on socket for later use
    (socket as any).requestId = requestId;

    // Create a logger with the request ID
    const log = fastify.log.child({
      requestId,
      socketId: socket.id,
      event: "socket_auth_attempt",
    });

    // Extract the token from the cookie header
    const cookieHeader = socket.handshake.headers.cookie;

    if (!cookieHeader) {
      log.warn("Missing authentication cookies");
      return next(new Error("Missing authentication token"));
    }

    // Get the auth token from cookies
    const token = getCookie(cookieHeader, config.auth.cookieName);

    if (!token) {
      log.warn(`Missing ${config.auth.cookieName} cookie`);
      return next(new Error("Missing authentication token"));
    }

    // Validate JWT token
    const user = await authenticateFromCookie(token);
    if (!user) {
      log.warn("Invalid authentication token");
      return next(new Error("Invalid authentication token"));
    }

    // Attach user to socket instance
    (socket as any).user = user;

    log.info({ userId: user.sub }, "Socket authenticated successfully");
    next();
  } catch (error) {
    const requestId =
      (socket as any).requestId ||
      (socket.handshake.headers["x-request-id"] as string) ||
      "unknown";

    fastify.log.error(
      {
        requestId,
        socketId: socket.id,
        error: error.message,
        event: "socket_auth_error",
      },
      "Socket authentication failed"
    );

    next(new Error("Authentication failed"));
  }
}