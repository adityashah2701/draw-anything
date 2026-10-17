/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as aiFrames from "../aiFrames.js";
import type * as aiMemory from "../aiMemory.js";
import type * as comments from "../comments.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_accessRules from "../lib/accessRules.js";
import type * as lib_commentRules from "../lib/commentRules.js";
import type * as users from "../users.js";
import type * as whiteboard from "../whiteboard.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  aiFrames: typeof aiFrames;
  aiMemory: typeof aiMemory;
  comments: typeof comments;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/accessRules": typeof lib_accessRules;
  "lib/commentRules": typeof lib_commentRules;
  users: typeof users;
  whiteboard: typeof whiteboard;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
