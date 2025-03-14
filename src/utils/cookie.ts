// utils/cookie.ts

/**
 * Parse a cookie header string into an object of key-value pairs
 * @param cookieHeader - The cookie header string to parse
 * @returns An object containing cookie key-value pairs
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader.split("; ").map((c) => {
      const [key, ...valueArr] = c.split("=");
      const value = valueArr.join("="); // Handle values that might contain "="
      return [key, value];
    })
  );
}

/**
 * Extract a specific cookie value from a cookie header string
 * @param cookieHeader - The cookie header string
 * @param cookieName - The name of the cookie to extract
 * @returns The value of the cookie or undefined if not found
 */
export function getCookie(
  cookieHeader: string,
  cookieName: string
): string | undefined {
  const cookies = parseCookies(cookieHeader);
  return cookies[cookieName];
}
