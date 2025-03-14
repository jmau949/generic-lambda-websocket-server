// /services/connectionService
import dynamoDbClient from "./dynamoDbClient";

const TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME || "socket-connections";
/**
 * Service for managing WebSocket connections stored in DynamoDB.
 */
const connectionService = {
  /**
   * Add a new connection to DynamoDB with a 2-hour TTL.
   * @param connectionId - The WebSocket connection ID.
   * @param userData - Optional user data.
   */
  async addConnection(
    connectionId: string,
    userData: Record<string, any> = {}
  ): Promise<void> {
    const timestamp = Date.now();
    const ttl = Math.floor(timestamp / 1000) + 60 * 60 * 2; // 2 hours

    const connection = {
      connectionId,
      timestamp,
      ttl,
      userData,
    };

    try {
      await dynamoDbClient.putItem(TABLE_NAME, connection);
    } catch (error) {
      console.error("Error adding connection:", error);
      throw new Error("Failed to add connection");
    }
  },

  /**
   * Remove a connection from DynamoDB.
   * @param connectionId - The connection ID to remove.
   */
  async removeConnection(connectionId: string): Promise<void> {
    try {
      await dynamoDbClient.deleteItem(TABLE_NAME, { connectionId });
    } catch (error) {
      console.error("Error removing connection:", error);
      throw new Error("Failed to remove connection");
    }
  },

  /**
   * Get all active connections with an optional limit for pagination.
   * @param limit - Maximum number of connections to return (default: 100).
   * @returns An array of connection objects.
   */
  async getConnections(limit = 100): Promise<Record<string, any>[]> {
    try {
      return await dynamoDbClient.scan(TABLE_NAME, { Limit: limit });
    } catch (error) {
      console.error("Error fetching connections:", error);
      throw new Error("Failed to fetch connections");
    }
  },

  /**
   * Find connections by a user data property.
   * This method is inefficient without a Global Secondary Index (GSI).
   * @param key - The user data key to filter by.
   * @param value - The value to match.
   * @param limit - Maximum number of connections to return.
   * @returns An array of matching connection objects.
   */
  async findConnectionsByUserData(
    key: string,
    value: any,
    limit = 100
  ): Promise<Record<string, any>[]> {
    const params = {
      FilterExpression: "userData.#key = :value",
      ExpressionAttributeNames: { "#key": key },
      ExpressionAttributeValues: { ":value": value },
      Limit: limit,
    };

    try {
      return await dynamoDbClient.scan(TABLE_NAME, params);
    } catch (error) {
      console.error("Error finding connections:", error);
      throw new Error("Failed to find connections");
    }
  },
};

export default connectionService;
