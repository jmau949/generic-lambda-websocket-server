// server.ts
import fastify, { FastifyInstance } from "fastify";
import config from "./config/config";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import socketPlugin from "./plugins/webSocketPlugin"; // Ensure this points to the correct plugin file
import { v4 as uuidv4 } from "uuid";
import sentryMonitoring from "./plugins/sentryMonitoringPlugin";
import errorHandlerPlugin from "./plugins/errorHandlerPlugin";

/**
 * Fastify WebSocket Application
 */
class WebSocketApplication {
  server: FastifyInstance;

  constructor() {
    this.server = fastify({
      logger: {
        level: "info",
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      },
      keepAliveTimeout: 60000,
      connectionTimeout: 60000,
      trustProxy: process.env.NODE_ENV === "production", // Important for AWS API Gateway
    });
  }

  /**
   * Start the WebSocket server locally
   */
  async startWebSocketServer() {
    try {
      console.log("Starting WebSocket server on port", config.server.port);
      const address = await this.server.listen({
        port: config.server.port as number,
        host: "0.0.0.0",
      });
      console.log(`WebSocket server listening at ${address}`);
    } catch (error) {
      this.server.log.error(error);
      process.exit(1);
    }
  }

  /**
   * Add a health check route (useful for API Gateway and load balancers)
   */
  addHealthCheck() {
    this.server.get("/health", async () => {
      return {
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
      };
    });
  }

  /**
   * Register Fastify plugins including WebSocket support
   */
  registerPlugins() {
    this.server.register(sentryMonitoring);
    this.server.register(fastifyHelmet);

    this.server.register(fastifyCookie, {
      parseOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 1 week
      },
    });

    // Register WebSocket plugin
    this.server.register(socketPlugin);
    this.server.register(errorHandlerPlugin);
  }

  /**
   * Start the Fastify application locally
   */
  async main() {
    console.log(`NODE ENV IS ${process.env.NODE_ENV}`);
    this.registerPlugins();
    this.addHealthCheck();
    await this.startWebSocketServer();
  }
}

// Start the WebSocket application
const webSocketApp = new WebSocketApplication();
webSocketApp.main();
