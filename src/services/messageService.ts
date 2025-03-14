// services/messageService.ts (Converted to AWS SDK v3)
// Purpose: Manages WebSocket message sending and storage
import { v4 as uuidv4 } from "uuid";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import dynamoDbClient from "./dynamoDbClient";
import config from "../config/config";
import connectionService from "./connectionService";

// Get table name from config
const messagesTable = config.aws.dynamodb.tableNames.messages;

// TTL duration in seconds (30 days)
const MESSAGE_TTL_SECONDS = 60 * 60 * 24 * 30;

interface Message {
  id: string;
  connectionId: string;
  content: string;
  timestamp: number;
  ttl: number;
  sessionId: string;
  metadata?: Record<string, any>;
}

// Cache API Gateway instance for reuse
let apiGateway: ApiGatewayManagementApiClient | null = null;

function getApiGateway(event: any) {
  if (!apiGateway) {
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const endpoint = `https://${domainName}/${stage}`;
    apiGateway = new ApiGatewayManagementApiClient({
      endpoint,
      region: config.aws.region,
    });
  }
  return apiGateway;
}

/**
 * Message service for managing WebSocket communication
 */
const messageService = {
  /**
   * Save a message to DynamoDB with automatic TTL
   * @param connectionId - The WebSocket connection ID
   * @param content - The message content
   * @param sessionId - The session identifier (conversation ID)
   * @param metadata - Optional additional metadata
   * @returns The saved message
   */
  async saveMessage(
    connectionId: string,
    content: string,
    sessionId: string,
    metadata?: Record<string, any>
  ): Promise<Message> {
    const now = Math.floor(Date.now() / 1000);

    const message: Message = {
      id: uuidv4(),
      connectionId,
      content,
      timestamp: Date.now(),
      ttl: now + MESSAGE_TTL_SECONDS, // Auto-expire after TTL period
      sessionId,
      ...(metadata && { metadata }),
    };

    await dynamoDbClient.putItem(messagesTable, message);
    return message;
  },

  /**
   * Get messages for a specific session/conversation
   * @param sessionId - The session/conversation ID
   * @param limit - Maximum number of messages to return
   * @returns The session's messages
   */
  async getSessionMessages(sessionId: string, limit = 100): Promise<Message[]> {
    return (await dynamoDbClient.query(
      messagesTable,
      "sessionId = :sessionId",
      { ":sessionId": sessionId },
      {
        IndexName: "sessionId-index",
        Limit: limit,
        ScanIndexForward: true, // Sort by oldest first for conversation flow
      }
    )) as Message[];
  },

  /**
   * Send a message to a client through WebSocket
   * Also acts as a heartbeat check for connection validity
   * @param event - The API Gateway event for context
   * @param connectionId - The connection to send to
   * @param payload - The message payload
   * @returns Success status
   */
  async sendToClient(
    event: any,
    connectionId: string,
    payload: any
  ): Promise<boolean> {
    try {
      const apiGatewayInstance = getApiGateway(event);

      const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload)),
      });

      await apiGatewayInstance.send(command);

      return true;
    } catch (error: any) {
      if (
        error.name === "GoneException" ||
        error.$metadata?.httpStatusCode === 410
      ) {
        // Connection is stale, remove it
        await connectionService.removeConnection(connectionId);
      }
      return false;
    }
  },

  /**
   * Persist a message to the database and send it to the client
   * @param event - The API Gateway event for context
   * @param connectionId - The connection to send to
   * @param content - The message content
   * @param sessionId - The session identifier
   * @param metadata - Optional additional metadata
   * @returns The saved message if successfully sent
   */
  async persistAndSendMessage(
    event: any,
    connectionId: string,
    content: string,
    sessionId: string,
    metadata?: Record<string, any>
  ): Promise<Message | null> {
    try {
      // Save message to database
      const message = await this.saveMessage(
        connectionId,
        content,
        sessionId,
        metadata
      );

      // Send message to client
      const success = await this.sendToClient(event, connectionId, {
        messageId: message.id,
        content,
        timestamp: message.timestamp,
        ...(metadata && { metadata }),
      });

      return success ? message : null;
    } catch (error) {
      console.error("Error sending and saving message:", error);
      return null;
    }
  },
};

export default messageService;
