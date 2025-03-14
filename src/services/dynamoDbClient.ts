// services/dynamoDbClient.ts
// Purpose: Low-level DynamoDB operations - a generic client abstraction
import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  PutCommand,
  PutCommandInput,
  DeleteCommand,
  DeleteCommandInput,
  QueryCommand,
  QueryCommandInput,
  UpdateCommand,
  UpdateCommandInput,
  ScanCommand,
  ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import config from "../config/config";
import { ReturnValue } from "@aws-sdk/client-dynamodb";
// Initialize DynamoDB client with configuration
const dynamoOptions: DynamoDBClientConfig = {
  region: config.aws.region,
};

// Use local endpoint for development if specified
if (config.aws.dynamodb.endpoint) {
  dynamoOptions.endpoint = config.aws.dynamodb.endpoint;
}

// Create raw DynamoDB client
const client = new DynamoDBClient(dynamoOptions);

// Create DocumentClient for higher-level operations
const dynamoDbClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertEmptyValues: true,
    removeUndefinedValues: true,
  },
});

/**
 * DynamoDB client service for common database operations
 */
export default {
  /**
   * Get an item from DynamoDB by partition key
   * @param tableName - The DynamoDB table name
   * @param key - The key object (must include the partition key)
   * @returns The item or undefined if not found
   */
  async getItem<T = Record<string, any>>(
    tableName: string,
    key: Record<string, any>
  ): Promise<T | undefined> {
    const params: GetCommandInput = {
      TableName: tableName,
      Key: key,
    };

    const command = new GetCommand(params);
    const result = await dynamoDbClient.send(command);
    return result.Item as T | undefined;
  },

  /**
   * Put an item into DynamoDB
   * @param tableName - The DynamoDB table name
   * @param item - The item to store
   * @returns The result of the put operation
   */
  async putItem(tableName: string, item: Record<string, any>) {
    const params: PutCommandInput = {
      TableName: tableName,
      Item: item,
    };

    const command = new PutCommand(params);
    return await dynamoDbClient.send(command);
  },

  /**
   * Delete an item from DynamoDB
   * @param tableName - The DynamoDB table name
   * @param key - The key object (must include the partition key)
   * @returns The result of the delete operation
   */
  async deleteItem(tableName: string, key: Record<string, any>) {
    const params: DeleteCommandInput = {
      TableName: tableName,
      Key: key,
    };

    const command = new DeleteCommand(params);
    return await dynamoDbClient.send(command);
  },

  /**
   * Query items from DynamoDB
   * @param tableName - The DynamoDB table name
   * @param keyConditionExpression - The key condition expression
   * @param expressionAttributeValues - The expression attribute values
   * @param options - Additional query options
   * @returns The query results
   */
  async query<T = Record<string, any>>(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    options: Partial<
      Omit<
        QueryCommandInput,
        "TableName" | "KeyConditionExpression" | "ExpressionAttributeValues"
      >
    > = {}
  ): Promise<T[]> {
    const params: QueryCommandInput = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ...options,
    };

    const command = new QueryCommand(params);
    const result = await dynamoDbClient.send(command);
    return (result.Items || []) as T[];
  },

  /**
   * Update an item in DynamoDB
   * @param tableName - The DynamoDB table name
   * @param key - The key object (must include the partition key)
   * @param updateExpression - The update expression
   * @param expressionAttributeValues - The expression attribute values
   * @param options - Additional update options
   * @returns The result of the update operation
   */
  async updateItem<T = Record<string, any>>(
    tableName: string,
    key: Record<string, any>,
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    options: Partial<
      Omit<
        UpdateCommandInput,
        | "TableName"
        | "Key"
        | "UpdateExpression"
        | "ExpressionAttributeValues"
        | "ReturnValues"
      >
    > = {}
  ): Promise<T | undefined> {
    const params: UpdateCommandInput = {
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW" as ReturnValue,
      ...options,
    };

    const command = new UpdateCommand(params);
    const result = await dynamoDbClient.send(command);
    return result.Attributes as T | undefined;
  },

  /**
   * Scan items from DynamoDB
   * @param tableName - The DynamoDB table name
   * @param options - Scan options including filters
   * @returns The scan results
   */
  async scan<T = Record<string, any>>(
    tableName: string,
    options: Partial<Omit<ScanCommandInput, "TableName">> = {}
  ): Promise<T[]> {
    const params: ScanCommandInput = {
      TableName: tableName,
      ...options,
    };

    const command = new ScanCommand(params);
    const result = await dynamoDbClient.send(command);
    return (result.Items || []) as T[];
  },
};