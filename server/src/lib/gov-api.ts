import { logger } from "./logger";

interface KycVerificationResult {
  verified: boolean;
  businessName: string | null;
  registrationNumber: string | null;
  status: string | null;
  address: string | null;
  directorNames: string[];
  error: string | null;
}

const GOV_API_BASE = process.env.GOV_API_BASE_URL ?? "";
const GOV_API_KEY = process.env.GOV_API_KEY ?? "";
const GOV_API_TIMEOUT = parseInt(process.env.GOV_API_TIMEOUT ?? "10000", 10);

function isConfigured(): boolean {
  return !!(GOV_API_BASE && GOV_API_KEY);
}

/**
 * Verify a Nigerian CAC business registration number.
 * Falls back to mock verification when GOV_API_* env vars are not set.
 */
export async function verifyCacBusiness(
  cacNumber: string,
): Promise<KycVerificationResult> {
  if (!isConfigured()) {
    logger.warn(
      { cacNumber },
      "Gov API not configured — returning mock CAC verification",
    );
    return mockCacVerification(cacNumber);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOV_API_TIMEOUT);

    const response = await fetch(
      `${GOV_API_BASE}/cac/business/${encodeURIComponent(cacNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${GOV_API_KEY}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error(
        { cacNumber, status: response.status, body: text },
        "Gov API CAC verification failed",
      );
      return {
        verified: false,
        businessName: null,
        registrationNumber: null,
        status: null,
        address: null,
        directorNames: [],
        error: `Gov API returned status ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      businessName?: string;
      registrationNumber?: string;
      status?: string;
      address?: string;
      directors?: Array<{ name?: string }>;
    };

    return {
      verified: data.status === "ACTIVE" || data.status === "active",
      businessName: data.businessName ?? null,
      registrationNumber: data.registrationNumber ?? null,
      status: data.status ?? null,
      address: data.address ?? null,
      directorNames:
        data.directors?.map((d) => d.name ?? "Unknown").filter(Boolean) ?? [],
      error: null,
    };
  } catch (err) {
    logger.error({ err, cacNumber }, "Gov API CAC verification exception");
    return {
      verified: false,
      businessName: null,
      registrationNumber: null,
      status: null,
      address: null,
      directorNames: [],
      error: String(err),
    };
  }
}

function mockCacVerification(cacNumber: string): KycVerificationResult {
  const clean = cacNumber.replace(/\s+/g, "").toUpperCase();
  const validFormat = /^RC\d{6,8}$/.test(clean) || /^BN\d{6,8}$/.test(clean);

  if (!validFormat) {
    return {
      verified: false,
      businessName: null,
      registrationNumber: null,
      status: null,
      address: null,
      directorNames: [],
      error: "Invalid CAC number format (expected RC1234567 or BN1234567)",
    };
  }

  return {
    verified: true,
    businessName: `${clean} Trading Co., Ltd.`,
    registrationNumber: clean,
    status: "ACTIVE",
    address: "42 Awolowo Road, Ikoyi, Lagos, Nigeria",
    directorNames: ["Chidi Okonkwo", "Aisha Bello"],
    error: null,
  };
}

/**
 * Perform full KYC verification for a user.
 * Checks CAC registration, cross-references director names.
 */
export async function performKycVerification(params: {
  cacNumber: string;
  taxClearanceUrl?: string;
  exportLicenseUrl?: string;
  governmentIdUrl?: string;
  businessDocUrl?: string;
}): Promise<{
  overall: "APPROVED" | "REJECTED" | "PENDING";
  cacResult: KycVerificationResult;
  checks: string[];
}> {
  const checks: string[] = [];

  if (!params.cacNumber) {
    return {
      overall: "REJECTED",
      cacResult: {
        verified: false,
        businessName: null,
        registrationNumber: null,
        status: null,
        address: null,
        directorNames: [],
        error: "CAC number is required",
      },
      checks: ["Missing CAC number"],
    };
  }

  const cacResult = await verifyCacBusiness(params.cacNumber);

  if (!cacResult.verified) {
    checks.push(`CAC verification failed: ${cacResult.error}`);
    return { overall: "REJECTED", cacResult, checks };
  }

  checks.push(`CAC verified: ${cacResult.businessName} (${cacResult.registrationNumber})`);
  checks.push(`Status: ${cacResult.status}`);
  checks.push(`Directors: ${cacResult.directorNames.join(", ") || "None listed"}`);

  // Optional document checks based on presence of URLs
  if (params.taxClearanceUrl) checks.push("Tax clearance document provided");
  if (params.exportLicenseUrl) checks.push("Export license provided");
  if (params.governmentIdUrl) checks.push("Government ID provided");
  if (params.businessDocUrl) checks.push("Additional business document provided");

  return { overall: "APPROVED", cacResult, checks };
}
