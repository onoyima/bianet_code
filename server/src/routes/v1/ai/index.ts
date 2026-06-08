import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, aiDiagnosticLogsTable } from "@workspace/db";
import { authenticate } from "../../../middlewares/authenticate";
import { aiDiagnoseLimiter } from "../../../middlewares/rate-limit";
import { uploadDiagnosticImage } from "../../../middlewares/upload";
import { logger } from "../../../lib/logger";
import multer from "multer";

const router: IRouter = Router();

const PLANT_ID_API_KEY = process.env.PLANT_ID_API_KEY;

// ─── Multilingual translation maps ──────────────────────────────────────────
const TRANSLATIONS: Record<string, Record<string, string>> = {
  ha: {
    "Leaf Blight (Mock)": "Kumburin Ganye (Mock)",
    "Apply neem oil spray; remove infected leaves": "A yi fesa man neem; a cire ganyayen da suka cutu",
    "Apply copper-based fungicide every 7 days": "A yi amfani da maganin fungi na jan karfe kowane kwana 7",
    "isHealthy": "lafiya",
    "true": "gaskiya",
    "false": "ƙarya",
  },
  ig: {
    "Leaf Blight (Mock)": "Ọrịa Akwukwo (Mock)",
    "Apply neem oil spray; remove infected leaves": "Tinye mmanụ neem spray; wepu akwukwo ndi ọria",
    "Apply copper-based fungicide every 7 days": "Tinye ọgwụ fungicide nke ọla kọpa kwa ụbọchị asaa",
    "isHealthy": "di mma",
    "true": "eziokwu",
    "false": "ụgha",
  },
  yo: {
    "Leaf Blight (Mock)": "Àrùn Ewe (Mock)",
    "Apply neem oil spray; remove infected leaves": "Fi epo neem spray; yo ewe ti o ti bajẹ kuro",
    "Apply copper-based fungicide every 7 days": "Fi oogun fungicide ti o ni baba loju ọjọ meje",
    "isHealthy": "ni ilera",
    "true": "otitọ",
    "false": "eke",
  },
};

function translate(text: string | null, lang: string): string | null {
  if (!text || lang === "en") return text;
  return TRANSLATIONS[lang]?.[text] ?? text;
}

/**
 * POST /api/v1/ai/diagnose
 * Submit a plant image URL for AI disease diagnosis.
 * Proxies to Plant.id API or any configured diagnostic engine.
 */
router.post(
  "/v1/ai/diagnose",
  authenticate,
  (req, res, next) => {
    uploadDiagnosticImage(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          const publicMsg = err.code === "LIMIT_FILE_SIZE"
            ? "File too large (max 10MB)"
            : "Upload failed";
          res.status(400).json({ error: publicMsg });
          return;
        }
        res.status(400).json({ error: "Upload failed" });
        return;
      }
      next();
    });
  },
  aiDiagnoseLimiter,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : (req.body.imageUrl as string | undefined);
    const { cropType, language = "en" } = req.body as {
      cropType?: string;
      language?: string;
    };

    if (!imageUrl || typeof imageUrl !== "string") {
      res.status(400).json({ error: "imageUrl is required" });
      return;
    }

    const validLanguages = ["en", "ha", "ig", "yo"];
    const lang = validLanguages.includes(language) ? language : "en";

    let diagnosisResult: {
      diseaseName: string | null;
      confidence: number | null;
      isHealthy: string;
      treatmentOrganic: string | null;
      treatmentChemical: string | null;
      rawResponse: Record<string, unknown> | null;
    } = {
      diseaseName: null,
      confidence: null,
      isHealthy: "false",
      treatmentOrganic: null,
      treatmentChemical: null,
      rawResponse: null,
    };

    // Call AI diagnostic API if key is configured
    if (PLANT_ID_API_KEY) {
      try {
        const response = await fetch("https://api.plant.id/v3/health_assessment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": PLANT_ID_API_KEY,
          },
          body: JSON.stringify({
            images: [imageUrl],
            health: "all",
            language: lang,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            result?: {
              is_healthy?: { probability?: number };
              disease?: {
                suggestions?: Array<{
                  name?: string;
                  probability?: number;
                  details?: {
                    treatment?: {
                      biological?: string[];
                      chemical?: string[];
                    };
                  };
                }>;
              };
            };
          };

          const result = data.result;
          const isHealthyProb = result?.is_healthy?.probability ?? 0;
          const topDisease = result?.disease?.suggestions?.[0];

          diagnosisResult = {
            isHealthy: isHealthyProb > 0.5 ? "true" : "false",
            diseaseName: topDisease?.name ?? null,
            confidence: topDisease?.probability ?? null,
            treatmentOrganic:
              topDisease?.details?.treatment?.biological?.join("; ") ?? null,
            treatmentChemical:
              topDisease?.details?.treatment?.chemical?.join("; ") ?? null,
            rawResponse: data as Record<string, unknown>,
          };

          // Translate Plant.id response for non-English
          if (lang !== "en") {
            diagnosisResult.diseaseName = translate(diagnosisResult.diseaseName, lang);
            diagnosisResult.treatmentOrganic = translate(diagnosisResult.treatmentOrganic, lang);
            diagnosisResult.treatmentChemical = translate(diagnosisResult.treatmentChemical, lang);
          }
        } else {
          req.log.warn({ status: response.status }, "AI API returned error");
        }
      } catch (err) {
        req.log.error({ err }, "AI diagnostic API call failed");
      }
    } else {
      // Dev mode — return mock result (translated if needed)
      diagnosisResult = {
        isHealthy: "false",
        diseaseName: translate("Leaf Blight (Mock)", lang),
        confidence: 0.87,
        treatmentOrganic: translate("Apply neem oil spray; remove infected leaves", lang),
        treatmentChemical: translate("Apply copper-based fungicide every 7 days", lang),
        rawResponse: { mock: true, language: lang },
      };
    }

    const [log] = await db
      .insert(aiDiagnosticLogsTable)
      .values({
        userId,
        imageUrl,
        diseaseName: diagnosisResult.diseaseName,
        confidence: diagnosisResult.confidence?.toFixed(4) ?? null,
        isHealthy: diagnosisResult.isHealthy,
        treatmentOrganic: diagnosisResult.treatmentOrganic,
        treatmentChemical: diagnosisResult.treatmentChemical,
        rawResponse: diagnosisResult.rawResponse,
        language: lang,
        cropType: cropType ?? null,
        ipAddress:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          req.socket.remoteAddress,
      })
      .returning();

    logger.info(
      { userId, diseaseName: diagnosisResult.diseaseName },
      "AI diagnostic completed",
    );

    res.json(log);
  },
);

/**
 * GET /api/v1/ai/history
 */
router.get(
  "/v1/ai/history",
  authenticate,
  async (req, res): Promise<void> => {
    const userId = req.user!.sub;
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(aiDiagnosticLogsTable)
      .where(eq(aiDiagnosticLogsTable.userId, userId))
      .orderBy(desc(aiDiagnosticLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: db.$count(aiDiagnosticLogsTable, eq(aiDiagnosticLogsTable.userId, userId)) })
      .from(aiDiagnosticLogsTable);

    res.json({
      data: rows,
      meta: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    });
  },
);

export default router;
