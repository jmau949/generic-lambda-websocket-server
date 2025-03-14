// src/utils/socket-error-handler.ts

import { Socket } from "socket.io";

/**
 * Custom base error class that extends JavaScript's built-in Error.
 * Used for defining application-specific errors with a consistent structure for Socket.IO.
 */
export class AppError extends Error {
  statusCode: number; // Status code for the error (similar to HTTP status codes)
  errorCode: string; // Unique error code for internal tracking
  socketId?: string; // Optional socket ID where the error occurred

  /**
   * Constructs an AppError instance.
   * @param {string} message - A human-readable error message.
   * @param {number} [statusCode=500] - Status code (default: 500 for internal server error).
   * @param {string} [errorCode="INTERNAL_SERVER_ERROR"] - Internal error code for tracking.
   * @param {string} [socketId] - The Socket.IO connection ID related to this error.
   */
  constructor(
    message: string,
    statusCode = 500,
    errorCode = "INTERNAL_SERVER_ERROR",
    socketId?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.socketId = socketId;
    this.name = this.constructor.name;

    // Capture stack trace to retain useful debugging information
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Specialized error class for authentication-related errors.
 * Extends AppError and always returns a 401 Unauthorized status.
 */
export class AuthError extends AppError {
  /**
   * Constructs an AuthError instance.
   * @param {string} message - A human-readable authentication error message.
   * @param {string} errorCode - Internal authentication error code.
   * @param {string} [socketId] - The Socket.IO connection ID related to this error.
   */
  constructor(message: string, errorCode: string, socketId?: string) {
    super(message, 401, errorCode, socketId);
  }
}

/**
 * Specialized error class for connection-related errors in Socket.IO.
 */
export class ConnectionError extends AppError {
  /**
   * Constructs a ConnectionError instance.
   * @param {string} message - A human-readable connection error message.
   * @param {string} errorCode - Internal connection error code.
   * @param {string} [socketId] - The Socket.IO connection ID related to this error.
   */
  constructor(message: string, errorCode: string, socketId?: string) {
    super(message, 503, errorCode, socketId); // 503 Service Unavailable
  }
}

/**
 * Specialized error class for rate limiting in Socket.IO.
 */
export class RateLimitError extends AppError {
  /**
   * Constructs a RateLimitError instance.
   * @param {string} message - A human-readable rate limit error message.
   * @param {string} [socketId] - The Socket.IO connection ID related to this error.
   */
  constructor(
    message = "Too many requests. Please try again later.",
    socketId?: string
  ) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", socketId);
  }
}

/**
 * Authentication error handler for socket-based auth systems
 *
 * @param {any} error - The authentication error
 * @param {string} [socketId] - The socket ID associated with the error
 * @returns {AppError} - A properly mapped AppError
 */
export const handleAuthError = (error: any, socketId?: string): AppError => {
  const errorMessage = error.message || "Authentication failed";
  const errorCode = error.code || "AUTH_ERROR";

  // Common authentication error scenarios in socket-based systems
  if (errorMessage.includes("token expired")) {
    return new AuthError(
      "Your session has expired. Please reconnect.",
      "TOKEN_EXPIRED",
      socketId
    );
  } else if (errorMessage.includes("invalid token")) {
    return new AuthError(
      "Invalid authentication token.",
      "INVALID_TOKEN",
      socketId
    );
  } else if (errorMessage.includes("unauthorized")) {
    return new AuthError("Unauthorized access.", "UNAUTHORIZED", socketId);
  } else if (errorMessage.includes("rate limit")) {
    return new RateLimitError(
      "Too many authentication attempts. Please try again later.",
      socketId
    );
  }

  // Default case for other auth errors
  return new AuthError(errorMessage, errorCode, socketId);
};

/**
 * Handles errors by sending them through the socket connection.
 * Ensures consistent error handling across Socket.IO events.
 *
 * @param {Socket} socket - The Socket.IO socket object.
 * @param {any} error - The error object to handle.
 * @param {string} [eventName="error"] - The event name to emit the error on.
 */
export const sendSocketError = (
  socket: Socket,
  error: any,
  eventName = "error"
): void => {
  // Identify authentication errors by message content if not already an AuthError
  if (
    !(error instanceof AppError) &&
    (error.message?.toLowerCase().includes("unauthorized") ||
      error.message?.toLowerCase().includes("token"))
  ) {
    error = new AuthError(
      error.message || "Authentication required",
      "AUTH_REQUIRED",
      socket.id
    );
  }

  // Convert error into an AppError if it's not already
  const appError =
    error instanceof AppError
      ? error // If already an instance of AppError, use it directly
      : error.message?.toLowerCase().includes("auth")
      ? handleAuthError(error, socket.id) // Handle auth-related errors
      : new AppError(
          error.message || "An unexpected error occurred",
          500,
          "INTERNAL_SERVER_ERROR",
          socket.id
        ); // Default fallback error

  // Set socketId if not already set
  if (!appError.socketId) {
    appError.socketId = socket.id;
  }

  // Log errors with more structured format
  console.error(
    `[SOCKET ERROR] ${appError.statusCode} - ${appError.message} (Socket ID: ${appError.socketId})`,
    {
      errorCode: appError.errorCode,
      stack: appError.stack,
    }
  );

  // Send the structured error response through the socket
  socket.emit(eventName, {
    error: appError.message, // Human-readable error message
    errorCode: appError.errorCode, // Internal error code
    status: appError.statusCode, // Status code
    socketId: appError.socketId, // Include socket ID for easier debugging
    timestamp: new Date().toISOString(), // Add timestamp
  });
};

/**
 * Create a middleware for handling errors in Socket.IO event handlers
 *
 * @param {Function} handler - The event handler function
 * @param {Socket} socket - The Socket.IO socket
 * @returns {Function} - The wrapped handler function with error handling
 */
export const withErrorHandling = (handler: Function) => {
  return async (socket: Socket, ...args: any[]) => {
    try {
      // Extract callback function if it exists (last argument and is a function)
      const lastArg = args.length > 0 ? args[args.length - 1] : null;
      const hasCallback = typeof lastArg === "function";
      const callback = hasCallback ? args.pop() : null;

      // Run the handler
      const result = await handler(socket, ...args);

      // Call callback if exists
      if (hasCallback && callback) {
        callback(null, result);
      }

      return result;
    } catch (error) {
      // Handle the error
      sendSocketError(socket, error);

      // If there was a callback, call it with the error
      const lastArg = args.length > 0 ? args[args.length - 1] : null;
      if (typeof lastArg === "function") {
        const callback = args.pop();
        const appError =
          error instanceof AppError
            ? error
            : new AppError(
                error.message || "An unexpected error occurred",
                500,
                "INTERNAL_SERVER_ERROR",
                socket.id
              );

        callback({
          error: appError.message,
          errorCode: appError.errorCode,
          status: appError.statusCode,
        });
      }
    }
  };
};

/**
 * DynamoDB error handler - maps DynamoDB errors to appropriate AppError types
 *
 * @param {any} error - The DynamoDB error object
 * @param {string} [socketId] - The socket ID associated with the error
 * @returns {AppError} - A properly mapped AppError
 */
export const handleDynamoDBError = (
  error: any,
  socketId?: string
): AppError => {
  const errorName = error.name || error.code || "UnknownDynamoDBError";

  switch (errorName) {
    case "ConditionalCheckFailedException":
      return new AppError(
        "The condition for the operation was not met.",
        400,
        "CONDITION_FAILED",
        socketId
      );
    case "ProvisionedThroughputExceededException":
      return new RateLimitError(
        "Database capacity exceeded. Please try again later.",
        socketId
      );
    case "ResourceNotFoundException":
      return new AppError(
        "The requested resource was not found.",
        404,
        "RESOURCE_NOT_FOUND",
        socketId
      );
    case "TransactionCanceledException":
      return new AppError(
        "The transaction was canceled.",
        409,
        "TRANSACTION_CANCELED",
        socketId
      );
    case "ItemCollectionSizeLimitExceededException":
      return new AppError(
        "Item collection size limit exceeded.",
        413,
        "COLLECTION_SIZE_LIMIT",
        socketId
      );
    case "ValidationException":
      return new AppError(
        error.message || "Invalid data provided.",
        400,
        "VALIDATION_ERROR",
        socketId
      );
    case "InternalServerError":
      return new AppError(
        "DynamoDB service encountered an internal error.",
        500,
        "DYNAMODB_INTERNAL_ERROR",
        socketId
      );
    default:
      console.error("Unhandled DynamoDB error:", error);
      return new AppError(
        "A database error occurred.",
        500,
        "DYNAMODB_ERROR",
        socketId
      );
  }
};

/**
 * Lambda error handler - maps AWS Lambda errors to appropriate AppError types
 *
 * @param {any} error - The Lambda error object
 * @param {string} [socketId] - The socket ID associated with the error
 * @returns {AppError} - A properly mapped AppError
 */
export const handleLambdaError = (error: any, socketId?: string): AppError => {
  const errorType = error.name || error.code || "UnknownLambdaError";

  switch (errorType) {
    case "ServiceException":
      return new AppError(
        "AWS Lambda service error.",
        500,
        "LAMBDA_SERVICE_ERROR",
        socketId
      );
    case "ResourceNotFoundException":
      return new AppError(
        "The requested Lambda resource was not found.",
        404,
        "LAMBDA_NOT_FOUND",
        socketId
      );
    case "TooManyRequestsException":
      return new RateLimitError(
        "Too many Lambda invocations. Please try again later.",
        socketId
      );
    case "InvalidParameterValueException":
      return new AppError(
        "Invalid parameter value in Lambda request.",
        400,
        "LAMBDA_INVALID_PARAMETER",
        socketId
      );
    case "RequestEntityTooLargeException":
      return new AppError(
        "Lambda request payload too large.",
        413,
        "PAYLOAD_TOO_LARGE",
        socketId
      );
    case "TimeoutException":
      return new AppError(
        "Lambda function execution timed out.",
        504,
        "LAMBDA_TIMEOUT",
        socketId
      );
    default:
      console.error("Unhandled Lambda error:", error);
      return new AppError(
        "An AWS Lambda error occurred.",
        500,
        "LAMBDA_ERROR",
        socketId
      );
  }
};
