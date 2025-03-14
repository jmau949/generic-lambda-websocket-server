const corsConfig = {
  dev: {
    origin: "http://localhost:5173", // Allow local development frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Allow credentials to be included
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"], // Ensure consistent casing
    exposedHeaders: ["X-Request-ID"],
  },
  production: {
    origin: ["https://your-frontend-domain.com"], // Allow only your production frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // Enable credentials if needed (for cookies, etc.)
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"], // Ensure consistent casing
    exposedHeaders: ["X-Request-ID"],
  },
};

export default corsConfig;
