// lambda.ts
import fastify, { FastifyInstance } from "fastify";
import awsLambdaFastify from "@fastify/aws-lambda";
import { Context, APIGatewayProxyEvent } from "aws-lambda";
import config from "./config/config";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import socketPlugin from "./plugins/socketPlugin";
import { v4 as uuidv4 } from "uuid";
import sentryMonitoring from "./plugins/sentryMonitoringPlugin";
import errorHandlerPlugin from "./plugins/errorHandlerPlugin";

// Create the Fastify app
const app: FastifyInstance = fastify({
  logger: {
    level: "info",
    // Note: In production Lambda environment, consider removing pino-pretty
    // as it adds unnecessary overhead for formatted logs that CloudWatch doesn't use
    transport:
      process.env.NODE_ENV === "production"
        ? undefined
        : {
            target: "pino-pretty",
            options: { colorize: true },
          },
  },
  // No need for keepAliveTimeout or connectionTimeout in Lambda
  // Lambda has its own timeout management
  trustProxy: true, // Always trust the proxy when behind API Gateway
  // Generate request ID for each request
  genReqId: (request) => {
    // Extract request ID from Lambda event headers or use AWS request ID
    return (request.headers["x-request-id"] as string) || uuidv4();
  },
});

// Register plugins
const registerPlugins = () => {
  // Register Sentry monitoring first
  app.register(sentryMonitoring);

  // Register Helmet for security
  app.register(fastifyHelmet);

  // Register Cookie plugin (needed for authentication)
  app.register(fastifyCookie, {
    parseOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    },
  });

  // Register the custom Socket.io plugin with enhanced request ID support
  app.register(socketPlugin);
  app.register(errorHandlerPlugin);
};

// Add health check route
const addHealthCheck = () => {
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    };
  });
};

// Initialize the application
console.log(`NODE ENV IS ${process.env.NODE_ENV}`);
registerPlugins();
addHealthCheck();

// Create the Lambda handlers for different types of API Gateway events
const httpProxy = awsLambdaFastify(app);

// Main handler that routes different types of events
export const handler = async (event: any, context: Context) => {
  // Set the request ID from AWS context
  const requestId = context.awsRequestId;

  // For WebSocket events from API Gateway
  if (event.requestContext && event.requestContext.routeKey) {
    return handleWebSocketEvent(event, context, requestId);
  }

  // For HTTP events from API Gateway
  if (event.headers !== undefined) {
    // Ensure headers object exists
    event.headers = event.headers || {};

    // Set request ID if not present
    if (!event.headers["x-request-id"]) {
      event.headers["x-request-id"] = requestId;
    }

    // Handle HTTP request via Fastify
    return httpProxy(event, context);
  }

  // Fallback for unknown event types
  console.warn("Unknown event type received", { requestId });
  return {
    statusCode: 400,
    body: JSON.stringify({ error: "Unsupported event type" }),
  };
};

// Handler for WebSocket-specific events
async function handleWebSocketEvent(
  event: any,
  context: Context,
  requestId: string
) {
  const { routeKey, connectionId } = event.requestContext;

  app.log.info({
    message: "WebSocket event received",
    routeKey,
    connectionId,
    requestId,
  });

  try {
    switch (routeKey) {
      case "$connect":
        // Handle new WebSocket connection
        // You might want to store connection info in DynamoDB here
        return { statusCode: 200, body: "Connected" };

      case "$disconnect":
        // Handle WebSocket disconnection
        // You might want to remove connection from DynamoDB here
        return { statusCode: 200, body: "Disconnected" };

      case "$default":
        // Handle default route
        // Process the message and possibly broadcast to other clients
        // The actual Socket.io handling will be done by your socketPlugin
        break;

      default:
        // Handle custom routes
        // These could be specific message types defined in your app
        break;
    }

    // Pass the WebSocket event to your Socket.io plugin
    // Note: You'll need to adapt your socketPlugin to handle these events
    return await httpProxy(event, context);
  } catch (error) {
    app.log.error({
      message: "Error handling WebSocket event",
      routeKey,
      connectionId,
      requestId,
      error,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
}

// Lambda has its own lifecycle management, but we can define a cleanup function
// that AWS Lambda may call during function shutdown
export const cleanup = async () => {
  app.log.info("Lambda shutdown initiated");

  try {
    // Close Fastify server - stops accepting new connections
    await app.close();

    // Close Sentry if it's being used
    if (process.env.SENTRY_DSN) {
      // Assuming Sentry is initialized in sentryMonitoringPlugin
      const Sentry = require("@sentry/node");
      await Sentry.close(2000);
    }

    app.log.info("Lambda shutdown completed");
  } catch (err) {
    app.log.error("Error during shutdown:", err);
    throw err;
  }
};