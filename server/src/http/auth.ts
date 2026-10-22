import { compare, hash } from "bcryptjs";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { AuthenticatedUser, User, UserRole } from "../domain/types.js";
import { config } from "../config.js";
import { ApiError } from "./errors.js";
import type { NileGuardRepository } from "../domain/types.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      gatewayId?: string;
      nodeId?: string;
    }
  }
}

const userIssuer = "nileguard-api";
const userAudience = "nileguard-dashboard";
const gatewayIssuer = "nileguard-api";
const gatewayAudience = "nileguard-gateway";
const nodeIssuer = "nileguard-api";
const nodeAudience = "nileguard-node";

export function publicUser(user: User): Omit<User, "passwordHash"> {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return compare(password, user.passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export function signUserToken(user: User): string {
  return jwt.sign(
    { typ: "user", role: user.role },
    config.jwtSecret,
    { subject: user.id, issuer: userIssuer, audience: userAudience, expiresIn: "8h" },
  );
}

export function signGatewayToken(gatewayId: string): string {
  return jwt.sign(
    { typ: "gateway" },
    config.gatewayJwtSecret,
    { subject: gatewayId, issuer: gatewayIssuer, audience: gatewayAudience, expiresIn: "30d" },
  );
}

export function signNodeToken(nodeId: string): string {
  return jwt.sign(
    { typ: "node" },
    config.nodeJwtSecret,
    { subject: nodeId, issuer: nodeIssuer, audience: nodeAudience, expiresIn: "90d" },
  );
}

function readBearerToken(request: Request): string | undefined {
  const authorization = request.header("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

function decodeToken(token: string, secret: string, issuer: string, audience: string): JwtPayload {
  const decoded = jwt.verify(token, secret, { issuer, audience });
  if (typeof decoded === "string") throw new ApiError(401, "INVALID_TOKEN", "The access token is invalid.");
  return decoded;
}

export function authenticateUser(repository: NileGuardRepository): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const token = readBearerToken(request);
    if (!token) {
      next(new ApiError(401, "AUTH_REQUIRED", "Sign in to access this resource."));
      return;
    }

    let payload: JwtPayload;
    try {
      payload = decodeToken(token, config.jwtSecret, userIssuer, userAudience);
    } catch {
      next(new ApiError(401, "INVALID_TOKEN", "The access token is expired or invalid."));
      return;
    }
    if (payload.typ !== "user" || typeof payload.sub !== "string") {
      next(new ApiError(401, "INVALID_TOKEN", "This token cannot be used for dashboard access."));
      return;
    }
    void Promise.resolve(repository.getUserById(payload.sub)).then((user) => {
      if (!user) {
        next(new ApiError(401, "INVALID_TOKEN", "The account for this token no longer exists."));
        return;
      }
      request.authUser = { id: user.id, email: user.email, role: user.role };
      next();
    }).catch(next);
  };
}

export const authenticateGateway: RequestHandler = (request, _response, next) => {
  const token = readBearerToken(request);
  if (!token) {
    next(new ApiError(401, "GATEWAY_AUTH_REQUIRED", "A gateway access token is required."));
    return;
  }
  try {
    const payload = decodeToken(token, config.gatewayJwtSecret, gatewayIssuer, gatewayAudience);
    if (payload.typ !== "gateway" || typeof payload.sub !== "string") {
      throw new ApiError(401, "INVALID_GATEWAY_TOKEN", "This token cannot be used for gateway ingestion.");
    }
    request.gatewayId = payload.sub;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "INVALID_GATEWAY_TOKEN", "The gateway access token is expired or invalid."));
  }
};

export const authenticateNode: RequestHandler = (request, _response, next) => {
  const token = request.header("x-node-token");
  if (!token) {
    next(new ApiError(401, "NODE_AUTH_REQUIRED", "A field-node access token is required."));
    return;
  }
  try {
    const payload = decodeToken(token, config.nodeJwtSecret, nodeIssuer, nodeAudience);
    if (payload.typ !== "node" || typeof payload.sub !== "string") {
      throw new ApiError(401, "INVALID_NODE_TOKEN", "This token cannot be used for node ingestion.");
    }
    request.nodeId = payload.sub;
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "INVALID_NODE_TOKEN", "The node access token is expired or invalid."));
  }
};

export function requireRole(role: UserRole): RequestHandler {
  return (request, _response, next) => {
    if (!request.authUser) {
      next(new ApiError(401, "AUTH_REQUIRED", "Sign in to access this resource."));
      return;
    }
    if (request.authUser.role !== role) {
      next(new ApiError(403, "FORBIDDEN", `This action requires the ${role} role.`));
      return;
    }
    next();
  };
}

export function requireUser(request: Request): AuthenticatedUser {
  if (!request.authUser) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to access this resource.");
  return request.authUser;
}

export function requireGateway(request: Request): string {
  if (!request.gatewayId) throw new ApiError(401, "GATEWAY_AUTH_REQUIRED", "A gateway access token is required.");
  return request.gatewayId;
}

export function requireNode(request: Request): string {
  if (!request.nodeId) throw new ApiError(401, "NODE_AUTH_REQUIRED", "A field-node access token is required.");
  return request.nodeId;
}
