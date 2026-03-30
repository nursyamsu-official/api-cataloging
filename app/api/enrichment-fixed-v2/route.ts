import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "../../../lib/prisma";

interface Attribute {
  attribute_name: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function resolveAttributeRecordsArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) {
    return data;
  }
  if (data == null || typeof data !== "object") {
    return null;
  }
  const d = data as Record<string, unknown>;
  const nested = d.data;
  if (
    nested &&
    typeof nested === "object" &&
    !Array.isArray(nested) &&
    "attributes" in nested
  ) {
    const attrs = (nested as { attributes?: unknown }).attributes;
    if (Array.isArray(attrs)) {
      return attrs;
    }
  }
  if (Array.isArray(d.attributes)) {
    return d.attributes;
  }
  if (Array.isArray(nested)) {
    return nested;
  }
  return null;
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

function normalizeAttributeValue(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const nullLikeTokens = new Set([
    "N/A",
    "NA",
    "NONE",
    "NULL",
    "NOT APPLICABLE",
    "NOT AVAILABLE",
    "UNKNOWN",
    "-",
  ]);

  return nullLikeTokens.has(trimmed.toUpperCase()) ? null : trimmed;
}

function normalizeAttributeKey(key: string) {
  return key
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function isLikelyCodeToken(token: string) {
  if (!token) {
    return false;
  }

  const cleanedToken = token
    .toUpperCase()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
  if (cleanedToken.length < 4) {
    return false;
  }

  if (!/^[A-Z0-9./-]+$/.test(cleanedToken)) {
    return false;
  }

  return /\d/.test(cleanedToken);
}

const codeDerivedKeyPriority = [
  "PART_NUMBER",
  "INTERNAL_NUMBER",
  "SERIES",
  "CODE",
] as const;

const codeDerivedKeySet = new Set<string>(codeDerivedKeyPriority);

function getConfidentCodeValue(value: unknown) {
  const normalizedValue = normalizeAttributeValue(value);
  if (normalizedValue == null) {
    return null;
  }

  const stringValue = String(normalizedValue).trim().toUpperCase();
  if (!stringValue) {
    return null;
  }

  return isLikelyCodeToken(stringValue) ? stringValue : null;
}

function pickSingleCodeDerivedAttribute(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const selectedCodeAttribute: Record<string, unknown> = {};

  for (const key of codeDerivedKeyPriority) {
    if (!(key in attributes)) {
      continue;
    }

    const confidentCodeValue = getConfidentCodeValue(attributes[key]);
    if (confidentCodeValue == null) {
      continue;
    }

    selectedCodeAttribute[key] = confidentCodeValue;
    break;
  }

  return selectedCodeAttribute;
}

function enforceSingleOptionalCodeDerivedAttribute(
  attributes: Record<string, unknown>,
) {
  const nonCodeAttributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!codeDerivedKeySet.has(key)) {
      nonCodeAttributes[key] = value;
    }
  }

  return {
    ...nonCodeAttributes,
    ...pickSingleCodeDerivedAttribute(attributes),
  };
}

function mapCodeLabelToAttributeKey(label: string) {
  const normalizedLabel = normalizeAttributeKey(label);

  if (
    normalizedLabel === "PART" ||
    normalizedLabel === "PART_NO" ||
    normalizedLabel === "PART_NUMBER" ||
    normalizedLabel === "P_N" ||
    normalizedLabel === "PN"
  ) {
    return "PART_NUMBER";
  }

  if (
    normalizedLabel === "INTERNAL" ||
    normalizedLabel === "INTERNAL_NO" ||
    normalizedLabel === "INTERNAL_NUMBER"
  ) {
    return "INTERNAL_NUMBER";
  }

  if (normalizedLabel === "SERIES") {
    return "SERIES";
  }

  if (normalizedLabel === "CODE") {
    return "CODE";
  }

  return null;
}

function extractCodeDerivedAttributes(materialName: string) {
  const extracted: Record<string, string> = {};
  const normalizedMaterialName = materialName.toUpperCase();

  const labeledCodeRegex =
    /\b(PART(?:\s*(?:NO|NUMBER))?|P\/N|PN|CODE|SERIES|INTERNAL(?:\s*(?:NO|NUMBER))?)\b\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9./-]{2,})/g;
  for (const match of normalizedMaterialName.matchAll(labeledCodeRegex)) {
    const rawLabel = match[1];
    const rawValue = match[2];
    const mappedKey = mapCodeLabelToAttributeKey(rawLabel);
    const cleanedValue = rawValue?.trim();
    if (!mappedKey || !cleanedValue || !isLikelyCodeToken(cleanedValue)) {
      continue;
    }
    extracted[mappedKey] = cleanedValue;
  }

  // A common pattern in incoming names is "DESC; CODE".
  const separatorSegments = normalizedMaterialName
    .split(/[;|]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (separatorSegments.length > 1) {
    for (const segment of separatorSegments.slice(1)) {
      const segmentValue = segment.replace(/\s+/g, " ").trim();
      if (!segmentValue) {
        continue;
      }

      const segmentParts = segmentValue.split(" ").filter(Boolean);
      if (segmentParts.length !== 1) {
        continue;
      }

      const codeCandidate = segmentParts[0];
      if (!isLikelyCodeToken(codeCandidate)) {
        continue;
      }

      if (!extracted.PART_NUMBER) {
        extracted.PART_NUMBER = codeCandidate;
      }
    }
  }

  if (!extracted.PART_NUMBER && !extracted.CODE && !extracted.SERIES) {
    const genericTokens =
      normalizedMaterialName.match(/\b[A-Z0-9][A-Z0-9./-]{4,}\b/g) ?? [];
    const genericCodeCandidate = genericTokens.find((token) =>
      isLikelyCodeToken(token),
    );
    if (genericCodeCandidate) {
      if (/^\d{6,}$/.test(genericCodeCandidate)) {
        extracted.PART_NUMBER = genericCodeCandidate;
      } else if (!extracted.CODE) {
        extracted.CODE = genericCodeCandidate;
      }
    }
  }

  return pickSingleCodeDerivedAttribute(extracted) as Record<string, string>;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const material_name = url.searchParams.get("material_name");
  const category_code = url.searchParams.get("category_code");

  if (!material_name || !category_code) {
    return errorResponse(
      "MISSING_PARAMS",
      "Missing required parameters: material_name and category_code",
      400,
    );
  }

  // GET CATEGORY ATTRIBUTES (from Prisma)
  const row = await prisma.materialCategory.findUnique({
    where: { id: category_code },
  });

  if (!row) {
    return errorResponse(
      "CATEGORY_NOT_FOUND",
      `No material category found for id: ${category_code}`,
      404,
      { category_code },
    );
  }

  if (row.attributes == null) {
    return errorResponse(
      "CATEGORY_DATA_INVALID",
      "Material category has no attributes stored",
      502,
      { category_code },
    );
  }

  const data: any = row.attributes;

  // Extract only attribute_name from the result
  let attributeNames: string[];
  if (Array.isArray(data)) {
    attributeNames = (data as Attribute[]).map((item) => item.attribute_name);
  } else if (data && Array.isArray(data.data)) {
    attributeNames = (data.data as Attribute[]).map(
      (item) => item.attribute_name,
    );
  } else if (data && data.data && Array.isArray(data.data.attributes)) {
    attributeNames = (data.data.attributes as Attribute[]).map(
      (item) => item.attribute_name,
    );
  } else if (data && Array.isArray(data.attributes)) {
    attributeNames = (data.attributes as Attribute[]).map(
      (item) => item.attribute_name,
    );
  } else if (data && Array.isArray(data.attribute_name)) {
    attributeNames = data.attribute_name as string[];
  } else {
    return errorResponse(
      "CATEGORY_DATA_INVALID",
      "Stored category attributes have an invalid data format",
      502,
      { category_code },
    );
  }
  console.log(attributeNames);

  // START NOUN MODIFIER
  const nounModifierAttributes = resolveAttributeRecordsArray(data);

  if (!Array.isArray(nounModifierAttributes)) {
    return errorResponse(
      "CATEGORY_DATA_INVALID",
      "Category attributes are missing or invalid",
      502,
      { category_code },
    );
  }

  const forceObjectAttributes = [
    "NOUN",
    "MODIFIER",
    "MODIFIER 1",
    "MODIFIER 2",
    "MODIFIER 3",
  ];

  // ambil hanya attribute yang masuk whitelist
  const nounModifier = nounModifierAttributes
    .filter(
      (item: any) =>
        forceObjectAttributes.includes(item.attribute_name) &&
        item.attribute_value?.value,
    )
    // mapping ke object key-value
    .map((item: any) => ({
      [item.attribute_name]: item.attribute_value.value,
    }));

  // console.log(nounModifier);

  // END NOUN MODIFIER

  // FIRST AI processing: breakdown attribute data
  const systemPrompt = `
      You are an expert material master data engineer specialized in railway industry materials and UNSPSC classification.

      Your task is to normalize, enrich, and classify a material name into structured technical attributes, category, and UNSPSC code.

      IMPORTANT UNSPSC RULE (CRITICAL):
      - You MUST determine ONLY the UNSPSC COMMODITY code (8 digits).

      INPUT:
      - material_name: ${material_name}

      OBJECTIVES:

      1. TECHNICAL ATTRIBUTE EXTRACTION
        - Define and extract technical attributes based on ${attributeNames}, But keep remain Attibute and Attribute value FROM ${JSON.stringify(nounModifier)}
        - You MAY add additional non-category technical attributes when clearly present in material_name.
        - Analyze the material name and extract attributes using:
          a. Explicit information stated in the material name
          b. Implicit information derived from:
              - Part numbering conventions
              - International standards (ISO, DIN, ANSI, JIS)
              - Common mechanical & electrical engineering rules
        - For code-derived information, choose ONLY ONE most-appropriate key among PART_NUMBER, CODE, SERIES, INTERNAL_NUMBER, and skip all four if not needed.
        - Other reusable technical definitions are still allowed when confidently identified.

      2. CATEGORY CLASSIFICATION (RAILWAY INDUSTRY CONTEXT)
        - Determine ONE most appropriate category:
          - SPAREPART
          - TOOLS
          - INVENTORY
          - ASSET
        - Classification must follow railway maintenance and asset management practice.
        - Explanation with reason refer to railway industry standards or common railway practice.

      3. UNSPSC CLASSIFICATION (v26.0801 — STRICT)
          - Select the most appropriate UNSPSC COMMODITY code
          - Use the UNSPSC v26.0801 classification system
          - Explanation with reason must be concise and precise refer to UNSPSC v26.0801
          - Do NOT infer UNSPSC descriptions
          - Only use the provided UNSPSC master data
          - IF ONLY material is about BOLTS, select ONE the most appropriate UNSPSC COMMODITY CODE:
            31161601	Anchor bolts
            31161602	Blind bolts
            31161603	Carriage bolts
            31161604	Clevis bolts
            31161605	Cylinder bolts
            31161606	Door bolts
            31161607	Expansion bolts
            31161608	Lag bolts
            31161609	Toggle bolts
            31161610	Eye bolts
            31161611	Locking bolts
            31161612	Pin or collar bolts
            31161613	Tension bolts
            31161614	Structural bolts
            31161616	U bolts
            31161617	Wing bolts
            31161618	Threaded rod
            31161619	Stud bolts
            31161620	Hexagonal bolts
            31161621	Elevator bolts
            31161622	Shear bolt
            31161623	Cable bolt
            31161624	Resin bolt
            31161625	Railway track bolt
            31161626	Sems bolt
            31161627	Bolt assembly
            31161628	Square head bolt
            31161629	Round head bolt
            31161630	Blank bolt
            31161631	Shoulder bolt
            31161632	Rock bolt
            31161633	Stove bolt
            31161634	Over neck bolt
            31161635	Washer assembled bolt
            31161636	Welding bolt
            31161637	Socket head bolt
            31161638	T bolt
            31161639	Hanger bolt
            31161640	Hook bolt
            31161641	Taper shank bolt

          - IF ONLY material is about SPRINGS, select ONE the most appropriate UNSPSC COMMODITY CODE:
            31161901	Helical springs
            31161902	Leaf springs
            31161903	Spiral springs
            31161904	Compression springs
            31161905	Die springs
            31161906	Disk springs
            31161907	Extension springs
            31161908	Torsion springs
            31161909	Waveform spring
            31161910	Wireform spring
            31161911	Spring assembly
            31161912	Injector valve spring
            IF not suitable for SPRING, choose 31161911	Spring assembly


      ATTRIBUTE VALUE FORMATTING RULES (CRITICAL):
      - ATTRIBUTE_VALUE must be in UPPERCASE
      - ATTRIBUTE_VALUE MUST use SPACE to separate words, brands, series, and model identifiers
        - Example:
          - "INTEL CORE I7"
          - "ATI RADEON"
          - "LENOVO THINKPAD"
      - Units of measure MUST remain concatenated WITHOUT SPACE
        - Example:
          - "16GB"
          - "512GB"
          - "220V"
          - "50HZ"
      - Do NOT remove or merge words that are commonly written as separate terms
      - Alphanumeric product series must remain readable and correctly spaced
      - If any "REFERENCE TYPE" attribute -> Set the attribute value to null

      OUTPUT RULES:
      - Output MUST be valid JSON only
      - Do NOT include markdown, comments, or explanations
      - Output MUST be a SINGLE flat JSON object
      - Output MUST be in English
      - Use ATTRIBUTE_NAME exactly as provided (case-sensitive), BUT SKIP FOR "NOUN", "MODIFIER", "MODIFIER 1", "MODIFIER 2", "MODIFIER 3"
      - You MAY include additional technical keys not present in category attributes if they are confidently detected from the material name/code.
      - If an attribute has no value, set it to null

      FINAL OUTPUT SCHEMA (STRICT):

      {
        ${JSON.stringify(nounModifier)}, as object
        "<ATTRIBUTE_NAME>": "<ATTRIBUTE_VALUE or null>", 
        "X_CATEGORY": {
          "CATEGORY": "SPAREPART | TOOLS | INVENTORY | ASSET",
          "EXPLANATION": "<EXPLANATION>"
        }
        "X_UNSPC": {
          "COMMODITY": "<COMMODITY_CODE>",
          "COMMODITY_NAME": "<COMMODITY_NAME>",
          "SEGMENT": "<SEGMENT_CODE>",
          "FAMILY": "<FAMILY_CODE>",
          "CLASS": "<CLASS_CODE>",
          "EXPLANATION": "<EXPLANATION>"
        }
      }

    `;

  // console.log(systemPrompt);

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(material_name) },
      ],
      temperature: 0.0,
    });
  } catch (error) {
    console.error("OpenAI request failed:", error);
    return errorResponse(
      "OPENAI_REQUEST_FAILED",
      "Failed to process enrichment via OpenAI",
      502,
    );
  }

  const processedData = completion.choices[0]?.message?.content;
  // console.log(processedData);

  if (!processedData) {
    return errorResponse(
      "AI_EMPTY_RESPONSE",
      "No response from enrichment AI",
      502,
    );
  }

  let result: any;
  try {
    result = JSON.parse(processedData);
  } catch (parseError) {
    console.error("Error parsing secondary AI response:", parseError);
    return errorResponse(
      "AI_RESPONSE_INVALID_JSON",
      "Failed to parse enrichment AI response as JSON",
      500,
      {
        preview: processedData.slice(0, 200),
      },
    );
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return errorResponse(
      "AI_RESPONSE_INVALID_SHAPE",
      "Enrichment AI response must be a flat JSON object",
      500,
    );
  }

  const aiResult = result as Record<string, unknown>;
  const excludedAttributeKeys = new Set(forceObjectAttributes);
  const categoryAttributeAllowlist = new Set(attributeNames);
  const categoryAttributeByNormalizedKey = new Map<string, string>(
    attributeNames.map((name) => [normalizeAttributeKey(name), name]),
  );

  const categoryAttributeDefaults = Object.fromEntries(
    attributeNames
      .filter((name) => !excludedAttributeKeys.has(name))
      .map((name) => [name, null]),
  );

  const normalizedTopLevelAttributes: Record<string, unknown> = {};
  const potentialNewAttributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(aiResult)) {
    const normalizedKey = normalizeAttributeKey(key);
    if (
      normalizedKey === "X_CATEGORY" ||
      normalizedKey === "X_UNSPC" ||
      normalizedKey === "X_POTENTIAL_NEW_ATTRIBUTES"
    ) {
      continue;
    }

    const normalizedValue = normalizeAttributeValue(value);
    const mappedCategoryAttributeName = categoryAttributeAllowlist.has(key)
      ? key
      : categoryAttributeByNormalizedKey.get(normalizedKey);
    if (mappedCategoryAttributeName) {
      normalizedTopLevelAttributes[mappedCategoryAttributeName] =
        normalizedValue;
      continue;
    }
    if (normalizedKey) {
      potentialNewAttributes[normalizedKey] = normalizedValue;
    }
  }

  const fallbackCodeDerivedAttributes =
    extractCodeDerivedAttributes(material_name);
  for (const [fallbackKey, fallbackValue] of Object.entries(
    fallbackCodeDerivedAttributes,
  )) {
    const normalizedFallbackKey = normalizeAttributeKey(fallbackKey);
    if (!normalizedFallbackKey) {
      continue;
    }
    if (categoryAttributeByNormalizedKey.has(normalizedFallbackKey)) {
      continue;
    }

    const normalizedFallbackValue = normalizeAttributeValue(fallbackValue);
    const hasExistingNonNullValue =
      normalizedFallbackKey in potentialNewAttributes &&
      potentialNewAttributes[normalizedFallbackKey] != null;
    if (hasExistingNonNullValue) {
      continue;
    }
    potentialNewAttributes[normalizedFallbackKey] = normalizedFallbackValue;
  }
  const finalizedPotentialNewAttributes =
    enforceSingleOptionalCodeDerivedAttribute(potentialNewAttributes);

  const xCategoryValue =
    aiResult.X_CATEGORY ??
    Object.entries(aiResult).find(
      ([key]) => normalizeAttributeKey(key) === "X_CATEGORY",
    )?.[1];
  if (
    !xCategoryValue ||
    typeof xCategoryValue !== "object" ||
    Array.isArray(xCategoryValue)
  ) {
    return errorResponse(
      "AI_RESPONSE_MISSING_X_CATEGORY",
      "Enrichment AI response is missing X_CATEGORY",
      500,
    );
  }

  const xUnspcValue =
    aiResult.X_UNSPC ??
    Object.entries(aiResult).find(
      ([key]) => normalizeAttributeKey(key) === "X_UNSPC",
    )?.[1];
  if (
    !xUnspcValue ||
    typeof xUnspcValue !== "object" ||
    Array.isArray(xUnspcValue)
  ) {
    return errorResponse(
      "AI_RESPONSE_MISSING_X_UNSPC",
      "Enrichment AI response is missing X_UNSPC",
      500,
    );
  }

  result = {
    ...categoryAttributeDefaults,
    ...normalizedTopLevelAttributes,
    X_POTENTIAL_NEW_ATTRIBUTES: finalizedPotentialNewAttributes,
    X_CATEGORY: xCategoryValue,
    X_UNSPC: xUnspcValue,
  };

  if (result.X_UNSPC && result.X_UNSPC.COMMODITY) {
    try {
      const unspsc = await prisma.unspsc.findUnique({
        where: { code: result.X_UNSPC.COMMODITY },
      });
      result.X_UNSPC.COMMODITY_NAME = unspsc ? unspsc.name : null;

      const commodityCode = result.X_UNSPC.COMMODITY;
      if (commodityCode && commodityCode.length === 8) {
        result.X_UNSPC.SEGMENT = commodityCode.substring(0, 2) + "000000";
        result.X_UNSPC.FAMILY = commodityCode.substring(0, 4) + "0000";
        result.X_UNSPC.CLASS = commodityCode.substring(0, 6) + "00";

        // Fetch names for segment, family, class
        const segmentUnspsc = await prisma.unspsc.findUnique({
          where: { code: result.X_UNSPC.SEGMENT },
        });
        result.X_UNSPC.SEGMENT_NAME = segmentUnspsc ? segmentUnspsc.name : null;

        const familyUnspsc = await prisma.unspsc.findUnique({
          where: { code: result.X_UNSPC.FAMILY },
        });
        result.X_UNSPC.FAMILY_NAME = familyUnspsc ? familyUnspsc.name : null;

        const classUnspsc = await prisma.unspsc.findUnique({
          where: { code: result.X_UNSPC.CLASS },
        });
        result.X_UNSPC.CLASS_NAME = classUnspsc ? classUnspsc.name : null;
      }

      // Reorder X_UNSPC fields
      const reorderedX_UNSPC = {
        SEGMENT: result.X_UNSPC.SEGMENT,
        SEGMENT_NAME: result.X_UNSPC.SEGMENT_NAME,
        FAMILY: result.X_UNSPC.FAMILY,
        FAMILY_NAME: result.X_UNSPC.FAMILY_NAME,
        CLASS: result.X_UNSPC.CLASS,
        CLASS_NAME: result.X_UNSPC.CLASS_NAME,
        COMMODITY: result.X_UNSPC.COMMODITY,
        COMMODITY_NAME: result.X_UNSPC.COMMODITY_NAME,
        EXPLANATION: result.X_UNSPC.EXPLANATION,
      };
      result.X_UNSPC = reorderedX_UNSPC;
    } catch (error) {
      console.error("UNSPSC lookup failed:", error);
      return errorResponse(
        "UNSPSC_LOOKUP_FAILED",
        "Failed to enrich UNSPSC hierarchy",
        500,
      );
    }
  }
  return NextResponse.json(result);
}
