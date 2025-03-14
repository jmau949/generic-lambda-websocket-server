# 🚀 Generic Fastify WebSocket Server

A **production-grade Fastify WebSocket server** with:
- **Fastify** (`@fastify/websocket`) for WebSocket handling.
- **JWT authentication** via **AWS Cognito** with **HTTP-only cookies**.
- **Auto-reconnection** and **broadcasting support**.
- **Graceful error handling** and **scalability features**.

## 📌 **Tech Stack**
### **Backend**
- **Fastify** (`@fastify/websocket`) → WebSocket framework.
- **Fastify Cookie** (`@fastify/cookie`) → Reads `authToken` from HTTP-only cookies.
- **JWT Verification** (`jsonwebtoken` & `jwk-to-pem`) → Validates AWS Cognito JWT tokens.
- **AWS Cognito** → User authentication and token validation.

### **Frontend**
- **WebSockets API** → Establishes and maintains the connection.
- **Auth Context (`AuthProvider.jsx`)** → Manages authentication and integrates with WebSocket.
- **Reconnect Strategy** → Exponential backoff for re-establishing lost connections.

---

## 📌 **How It Works**
### **1️⃣ Authentication (JWT via HTTP-only Cookies)**
- **User logs in** via the frontend.
- Backend **sets `authToken`** as an **HTTP-only cookie** (not accessible by JavaScript).
- WebSocket **relies on the browser automatically sending cookies** in requests.

### **2️⃣ WebSocket Authentication**
- **Frontend connects to WebSocket (`ws://localhost:3020/ws`)**.
- The **backend extracts `authToken` from cookies** and validates it.
- **If valid** → Connection is established.
- **If invalid** → The server closes the WebSocket connection (`1008` policy violation).

---

## 📌 **Project Setup**
### **1️⃣ Install Dependencies**
```sh
npm install
```

### **2️⃣ Set Up Environment Variables (`.env`)**
```env
PORT=3020
AWS_ACCESS_KEY_ID=AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=AWS_SECRET_ACCESS_KEY
AWS_COGNITO_USER_POOL_ID=your-pool-id
AWS_REGION=your-region
AWS_COGNITO_CLIENT_ID=AWS_COGNITO_CLIENT_ID
AWS_COGNITO_CLIENT_SECRET=AWS_COGNITO_CLIENT_SECRET
```

### **3️⃣ Start the WebSocket Server**
```sh
npm run dev
```

---

```md
# Socket.io Custom Hook: useSocket

This custom React hook creates and manages a Socket.io connection, while incorporating a request ID from session storage for correlating API requests. This README explains how to use and implement the hook, along with best practices for integrating it into your project.

## Features

- **Connection Management**: Automatically establishes and cleans up the Socket.io connection.
- **Session Request ID**: Retrieves the `lastRequestId` from session storage and includes it in the connection headers.
- **Connection Status**: Exposes an `isConnected` boolean to indicate whether the socket is connected.

## Installation

Ensure you have the required dependencies in your project:

- [Socket.io Client](https://socket.io/)
- React

Install the Socket.io client using npm or yarn:

```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

## Usage

1. **Import the Hook**

   Import the custom hook into your React component:

```tsx
import useSocket from "./path/to/useSocket";
```

2. **Integrate the Hook**

   Use the hook within your component to access the `socket` instance and its connection status:

```tsx
const MyComponent = () => {
  const { socket, isConnected } = useSocket("http://your-socket-server-url");

  // Example: Emitting an event
  const sendMessage = () => {
    if (socket) {
      socket.emit("message", { text: "Hello from client" });
    }
  };

  return (
    <div>
      <h1>Socket Connection Status: {isConnected ? "Connected" : "Disconnected"}</h1>
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
};

export default MyComponent;
```

## Code Implementation

Below is the complete code for the custom hook:

```tsx
const SOCKET_SERVER_URL = "https://your-socket-server.com"; // Replace with actual URL

const MyComponent = () => {
  const { socket, isConnected } = useSocket(SOCKET_SERVER_URL);

  useEffect(() => {
    if (!socket) return;

    socket.on("message", (data) => {
      console.log("Received message:", data);
    });

    return () => {
      socket.off("message");
    };
  }, [socket]);

  return (
    <div>
      <h2>Socket Status: {isConnected ? "Connected" : "Disconnected"}</h2>
    </div>
  );
};
```

## Best Practices

- **Resource Cleanup**:  
  Always disconnect the socket in the cleanup function of `useEffect` to avoid memory leaks.

- **Error Handling**:  
  Listen for connection errors using the `connect_error` event to diagnose and handle potential issues.

- **Conditional Emission**:  
  Ensure the socket is connected before emitting events to prevent runtime errors.

- **Environment Variables**:  
  Use environment variables to store sensitive data like the Socket.io server URL, especially in production.

- **Session Management**:  
  Validate and manage the `lastRequestId` from session storage to maintain reliable request correlation.

- **Security**:  
  In production, use secure connections (`https`/`wss`) to safeguard your data during transmission.

## Conclusion

The `useSocket` custom hook simplifies integrating Socket.io in your React applications by managing the connection lifecycle and correlating requests using session-stored IDs. Customize and extend it as needed to better suit your application's requirements.
```


## ⚙️ How Authentication Works

- Client sends a request to the server including the authToken inside cookies.
- Server intercepts the request in the `io.use()` middleware.
- Server extracts the token from `socket.handshake.headers.cookie`.
- Server validates the token using `validateToken()`.
- If valid, the client is allowed to connect.
- If invalid, the connection is rejected.

## 🔀 How Socket.io Handles Multiple Clients

Each client gets its own `socket.id` (unique identifier). The server maintains a connection for each client.

### Example: Sending messages to all clients

```typescript
io.emit("message", { message: "Broadcast to all connected clients" });
```

### Example: Sending a message to a specific client

```typescript
socket.emit("privateMessage", { message: "Hello, user!" });
```

### Example: Handling client disconnects

```typescript
socket.on("disconnect", () => {
  console.log(`Client disconnected: ${socket.id}`);
});
```

## 🚀 Key Takeaways

- No explicit route is needed – Socket.io automatically manages connections.
- Each client has its own socket – Identified by `socket.id`.
- Authentication is validated before connection – Using cookies & JWTs.
- Clients can send & receive real-time messages – With `emit()` & `on()`.
- The server tracks active connections dynamically – Handles joins/disconnects.


# Complete WebSocket Flow with Connection Management


# Choosing Dynamo over redis due to cost


## Client Connection

1. Client initiates a WebSocket connection to your API Gateway endpoint.
2. API Gateway routes this to the `$connect` route, invoking your Lambda.
3. Lambda handler stores the connection ID in DynamoDB/Redis with user metadata.
4. API Gateway maintains the open connection.

## Message Handling

1. When a client sends a message, API Gateway invokes your Lambda with the message payload.
2. Lambda reads the message and determines the action needed.
3. Lambda looks up connection data from DynamoDB/Redis using the connection ID.
4. Lambda processes the message and sends any responses.

## Broadcasting/Multi-User Communication

To send messages to multiple users:

1. Lambda queries DynamoDB/Redis to get relevant connection IDs.
2. Lambda uses the API Gateway Management API to send messages to those connections.
3. Example: When a user posts a message to a chat room, you query for all connections in that room.

## Disconnection

1. When a client disconnects, API Gateway triggers the `$disconnect` route.
2. Lambda removes the connection ID from DynamoDB/Redis.
3. Any session state is preserved if needed for later reconnection.

## Connection Data Structure in DynamoDB

- **Primary key**: Connection ID
- **Attributes**:
  - User ID
  - Authentication status
  - Joined rooms/channels
  - Last activity timestamp
- **Optional**: TTL attribute for automatic cleanup of stale connections

## Authentication and Session Management

- On connect, validate tokens and store authenticated user info with the connection.
- For reconnects, users can provide a session token to restore their previous state.




i have a typescript fastify socket io only server that i am planning on deploying to api gateway, lambda, and dynamodb. help me productionize it similarily to my other fastify http server. 
currently, i am doing auth cookie check inside socket.ts, abstract it out