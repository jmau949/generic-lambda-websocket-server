// plugins/webSocketPlugin.ts (Converted to AWS API Gateway WebSockets)
import { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import messageService from "../services/messageService";
import connectionService from "../services/connectionService";
import config from "../config/config";

/**
 * WebSocket plugin for Fastify with API Gateway integration
 * Provides handlers for WebSocket events from API Gateway
 *
 * @param fastify - Fastify instance
 */
export default async function socketPlugin(fastify: FastifyInstance) {
  // Decorate Fastify with WebSocket handler methods
  fastify.decorate("websocket", {
    /**
     * Handle WebSocket connection event
     * @param event - API Gateway WebSocket event
     */
    async handleConnect(event: any) {
      const connectionId = event.requestContext.connectionId;
      const requestId = event.headers["x-request-id"] || uuidv4();

      // Create a logger with connection context
      const log = fastify.log.child({
        requestId,
        connectionId,
        event: "socket_connect",
      });

      try {
        // In a real implementation, you would validate auth here
        // For now, just store the connection
        await connectionService.addConnection(connectionId, {
          requestId,
          // You would add user info here after auth
        });

        log.info("WebSocket connection established");
        return { statusCode: 200, body: "Connected" };
      } catch (error) {
        log.error({ error }, "Failed to handle WebSocket connection");
        return { statusCode: 500, body: "Connection failed" };
      }
    },

    /**
     * Handle WebSocket disconnect event
     * @param event - API Gateway WebSocket event
     */
    async handleDisconnect(event: any) {
      const connectionId = event.requestContext.connectionId;

      const log = fastify.log.child({
        connectionId,
        event: "socket_disconnect",
      });

      try {
        await connectionService.removeConnection(connectionId);
        log.info("WebSocket connection closed");
        return { statusCode: 200, body: "Disconnected" };
      } catch (error) {
        log.error({ error }, "Failed to handle WebSocket disconnection");
        return { statusCode: 500, body: "Disconnection failed" };
      }
    },

    /**
     * Handle incoming WebSocket messages
     * @param event - API Gateway WebSocket event
     */
    async handleMessage(event: any) {
      const connectionId = event.requestContext.connectionId;
      const requestId = event.headers["x-request-id"] || uuidv4();

      // Create a logger with message context
      const log = fastify.log.child({
        requestId,
        connectionId,
        event: "socket_message",
      });

      try {
        // Parse the message body
        const body = JSON.parse(event.body);
        const routeKey = event.requestContext.routeKey;

        log.info({ body, routeKey }, "Received WebSocket message");

        // Handle custom event (equivalent to socket.on("customEvent"))
        if (routeKey === "customEvent") {
          // Generate a session ID for this conversation
          const sessionId = uuidv4();

          // Process the message
          const response = {
            message: "Hello from WebSocket!",
            requestId,
          };

          // Send a response back to the client
          await messageService.persistAndSendMessage(
            event,
            connectionId,
            JSON.stringify(response),
            sessionId
          );
        }

        return { statusCode: 200, body: "Message received" };
      } catch (error) {
        log.error({ error }, "Failed to handle WebSocket message");
        return { statusCode: 500, body: "Message handling failed" };
      }
    },
  });

  // Register a hook to clean up on server shutdown
  fastify.addHook("onClose", (instance, done) => {
    // io.close();
    done();
  });
}
