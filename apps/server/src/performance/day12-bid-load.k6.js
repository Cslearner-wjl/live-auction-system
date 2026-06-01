import http from "k6/http";
import { check, sleep } from "k6";

const apiBaseUrl = (__ENV.API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const auctionId = __ENV.DAY12_AUCTION_ID;
const bidderPrefix = __ENV.DAY12_BIDDER_PREFIX || "day12_user";
const incrementFen = Number(__ENV.DAY12_INCREMENT_FEN || "1000");
const p95ThresholdMs = Number(__ENV.DAY12_P95_THRESHOLD_MS || "5000");

export const options = {
  scenarios: {
    concurrent_bids: {
      executor: "shared-iterations",
      vus: Number(__ENV.DAY12_VUS || "30"),
      iterations: Number(__ENV.DAY12_BID_ATTEMPTS || "30"),
      maxDuration: __ENV.DAY12_MAX_DURATION || "30s"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.20"],
    http_req_duration: [`p(95)<${p95ThresholdMs}`]
  }
};

export default function () {
  if (!auctionId) {
    throw new Error("DAY12_AUCTION_ID is required. Create and start an auction before running k6.");
  }

  const attempt = __ITER + 1;
  const userId = `${bidderPrefix}_${attempt}`;
  const payload = JSON.stringify({
    amountFen: attempt * incrementFen,
    clientBidId: `k6-${auctionId}-${attempt}-${Date.now()}`
  });

  const response = http.post(`${apiBaseUrl}/auctions/${auctionId}/bids`, payload, {
    headers: {
      "content-type": "application/json",
      "x-demo-user-id": userId,
      "x-demo-role": "bidder"
    }
  });

  check(response, {
    "bid endpoint returns a controlled response": (res) => res.status < 500,
    "accepted or business rejection": (res) => res.status === 200 || res.status === 409
  });

  sleep(0.1);
}
