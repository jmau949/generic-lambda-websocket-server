// plugins/auth.ts
import axios from "axios";
import * as jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import config from "../config/config";

// AWS Cognito configuration
const USER_POOL_ID = config.aws.cognito.userPoolId;
const REGION = config.aws.region;
const JWK_URL = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;

// In-memory cache for JWKS
let jwksCache: any = null;
let jwksLastFetch = 0;
const CACHE_TTL = config.auth.jwksCacheTTL;

/**
 * Fetch and cache the JSON Web Key Set (JWKS) from AWS Cognito.
 */
export async function getJwks() {
  const now = Date.now();

  if (!jwksCache || now - jwksLastFetch > CACHE_TTL) {
    try {
      const response = await axios.get(JWK_URL);
      jwksCache = response.data.keys;
      jwksLastFetch = now;
    } catch (error) {
      console.error("Error fetching JWKs from Cognito:", error);
      throw new Error("Failed to retrieve JWKs");
    }
  }

  return jwksCache;
}

/**
 * Validate a JWT token using AWS Cognito's public keys.
 * @param token - The JWT token to validate.
 * @returns The verified token payload if successful.
 * @throws An error if the token is invalid or verification fails.
 */
export async function validateToken(token: string) {
  // Step 1: Decode the token to extract its header.
  const decodedToken = jwt.decode(token, { complete: true });

  if (!decodedToken || !decodedToken.header.kid) {
    throw new Error("Invalid token format");
  }

  // Step 2: Fetch the JWKS and find the key that matches the token's key ID.
  const jwks = await getJwks();
  const key = jwks.find((k: any) => k.kid === decodedToken.header.kid);

  if (!key) {
    throw new Error("Invalid token signature: Key ID not found");
  }

  // Step 3: Convert the JWK to PEM format.
  const pem = jwkToPem(key);

  // Step 4: Verify the token using the PEM-formatted key.
  try {
    const verifiedToken = jwt.verify(token, pem, {
      issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
      algorithms: ["RS256"],
    });

    return verifiedToken;
  } catch (error) {
    console.error("JWT Verification Failed:", error);
    throw new Error("Invalid token");
  }
}

/**
 * Extract and validate JWT token from cookie
 * @param cookieValue - The cookie value containing the JWT token
 * @returns The user data from the token or null if invalid
 */
export async function authenticateFromCookie(cookieValue: string) {
  if (!cookieValue) {
    return null;
  }

  try {
    return await validateToken(cookieValue);
  } catch (error) {
    return null;
  }
}
