// middleware/webSocketAuth.ts (Converted to AWS API Gateway WebSockets)
import { FastifyInstance } from "fastify";
import { authenticateFromCookie } from "../plugins/auth";
import { getCookie } from "../utils/cookie";
import { v4 as uuidv4 } from "uuid";
import config from "../config/config";
import connectionService from "../services/connectionService";

/**
 * WebSocket authentication middleware for API Gateway
 * Extracts and validates the JWT token from cookies
 *
 * @param fastify - Fastify instance
 * @param event - API Gateway WebSocket event
 * @returns Auth result with status code
 */
export async function webSocketAuthMiddleware(
  fastify: FastifyInstance,
  event: any
) {
  try {
    const connectionId = event.requestContext.connectionId;

    // Get request ID from headers or generate a new one
    const requestId = event.headers["x-request-id"] || uuidv4();

    // Create a logger with the request ID
    const log = fastify.log.child({
      requestId,
      connectionId,
      event: "socket_auth_attempt",
    });

    // Extract the cookie header
    const cookieHeader = event.headers.Cookie || event.headers.cookie;

    if (!cookieHeader) {
      log.warn("Missing authentication cookies");
      await connectionService.removeConnection(connectionId);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Missing authentication token" }),
      };
    }

    // Get the auth token from cookies
    const token = getCookie(cookieHeader, config.auth.cookieName);

    if (!token) {
      log.warn(`Missing ${config.auth.cookieName} cookie`);
      await connectionService.removeConnection(connectionId);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Missing authentication token" }),
      };
    }

    // Validate JWT token
    const user = await authenticateFromCookie(token);
    if (!user) {
      log.warn("Invalid authentication token");
      await connectionService.removeConnection(connectionId);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Invalid authentication token" }),
      };
    }

    // Update the connection with user data
    await connectionService.addConnection(connectionId, {
      requestId,
      userId: user.sub,
      // Add any other user data needed
    });

    log.info({ userId: user.sub }, "WebSocket authenticated successfully");
    return {
      statusCode: 200,
      user: user,
      requestId: requestId,
    };
  } catch (error) {
    const connectionId = event.requestContext.connectionId;
    const requestId = event.headers["x-request-id"] || "unknown";

    fastify.log.error(
      {
        requestId,
        connectionId,
        error: error.message,
        event: "socket_auth_error",
      },
      "WebSocket authentication failed"
    );

    // Clean up the connection on auth failure
    await connectionService.removeConnection(connectionId);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Authentication failed" }),
    };
  }
}
