import { SignJWT, importPKCS8 } from "jose";
import { fetchJson } from "../utils.js";
import { ReviewsResponseSchema, type Review } from "./schemas.js";

const ASC_API_BASE = "https://api.appstoreconnect.apple.com";
const ASC_AUDIENCE = "appstoreconnect-v1";

// Apple allows up to 20 minutes; leave headroom for clock skew.
const JWT_EXPIRY_SECONDS = 19 * 60;
const JWT_REFRESH_BUFFER_SECONDS = 60;

const PAGE_SIZE = 200;

export interface FetchReviewsResult {
  reviews: Review[];
}

export interface FetchReviewsOptions {
  since: Date | null;
  maxPages: number;
}

export interface AppStoreClient {
  fetchReviews(options: FetchReviewsOptions): Promise<FetchReviewsResult>;
}

export interface AppStoreClientOptions {
  issuerId: string;
  keyId: string;
  privateKey: string;
  appId: string;
}

export function createAppStoreClient(
  opts: AppStoreClientOptions,
): AppStoreClient {
  let cachedJwt: { token: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      cachedJwt &&
      cachedJwt.expiresAt - nowSeconds > JWT_REFRESH_BUFFER_SECONDS
    ) {
      return cachedJwt.token;
    }
    const key = await importPKCS8(opts.privateKey, "ES256");
    const expiresAt = nowSeconds + JWT_EXPIRY_SECONDS;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: opts.keyId, typ: "JWT" })
      .setIssuer(opts.issuerId)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expiresAt)
      .setAudience(ASC_AUDIENCE)
      .sign(key);
    cachedJwt = { token, expiresAt };
    return token;
  }

  async function request(url: string): Promise<unknown> {
    const token = await getToken();
    return fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  return {
    async fetchReviews(
      options: FetchReviewsOptions,
    ): Promise<FetchReviewsResult> {
      const { since, maxPages } = options;
      const reviews: Review[] = [];
      let nextUrl: string | undefined =
        `${ASC_API_BASE}/v1/apps/${opts.appId}/customerReviews` +
        `?sort=-createdDate&limit=${PAGE_SIZE}`;

      let pagesWalked = 0;
      while (nextUrl) {
        if (pagesWalked >= maxPages) {
          return { reviews };
        }

        const raw = await request(nextUrl);
        const parsed = ReviewsResponseSchema.parse(raw);
        pagesWalked++;

        for (const review of parsed.data) {
          if (since) {
            const createdAt = new Date(review.attributes.createdDate);
            // Strict `<` so reviews with the *same* createdDate as the
            // watermark are re-fetched; the poller dedupes via lastSeenIds.
            if (createdAt < since) {
              return { reviews };
            }
          }
          reviews.push(review);
        }

        nextUrl = parsed.links?.next;
      }

      return { reviews };
    },
  };
}
