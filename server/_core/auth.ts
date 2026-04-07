import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import type { User } from "../../drizzle/schema";

const SECRET = new TextEncoder().encode(ENV.jwtSecret);

export type JWTPayload = {
  userId: number;
  username: string;
  role: "admin" | "user";
};

/**
 * Create a JWT token for a user
 */
export async function createJWT(user: User): Promise<string> {
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(token: string): Promise<JWTPayload> {
  try {
    const verified = await jwtVerify(token, SECRET);
    return verified.payload as unknown as JWTPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

/**
 * Extract JWT token from Authorization header
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}
