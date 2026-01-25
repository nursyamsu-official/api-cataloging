import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

interface Attribute {
  attribute_name: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const material_name = url.searchParams.get("material_name");
  const category_code = url.searchParams.get("category_code");

  if (!material_name || !category_code) {
    return NextResponse.json(
      { error: "Missing required parameters: material_name and category_code" },
      { status: 400 },
    );
  }

  try {
    // GET CATEGORY ATTRIBUTES
    const fetchUrl = `https://mmkai.ptsisi.id/api/material_categories/get?id=${category_code}`;
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // console.log(data);

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
      return NextResponse.json(
        {
          error: "Invalid data format",
        },
        { status: 500 },
      );
    }

    console.log(attributeNames);

    // START NOUN MODIFIER
    const nounModifierAttributes = data?.data?.attributes;

    if (!Array.isArray(nounModifierAttributes)) {
      return NextResponse.json(
        { error: "Invalid data format" },
        { status: 500 },
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

    console.log(nounModifier);

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
        - Define and extract technical attributes based on ${attributeNames}
        - Analyze the material name and extract attributes using:
          a. Explicit information stated in the material name
          b. Implicit information derived from:
              - Part numbering conventions
              - International standards (ISO, DIN, ANSI, JIS)
              - Common mechanical & electrical engineering rules

      2. CATEGORY CLASSIFICATION (RAILWAY INDUSTRY CONTEXT)
        - Determine ONE most appropriate category:
          - SPAREPART
          - TOOLS
          - INVENTORY
          - ASSET
        - Classification must follow railway maintenance and asset management practice.
        - Explanation with reason refer to railway industry standard.

      3. UNSPSC CLASSIFICATION (v26.0801 — STRICT)
          - Select the most appropriate UNSPSC COMMODITY code
          - Use the UNSPSC v26.0801 classification system
          - Explanation with reason must be concise and precise refer to UNSPSC v26.0801
          - Do NOT infer UNSPSC descriptions
          - Only use the provided UNSPSC master data
          - If unsure, return UNSPSC_UNCERTAIN

      OUTPUT RULES:
      - Output MUST be valid JSON only
      - Do NOT include markdown, comments, or explanations
      - Output MUST be a SINGLE flat JSON object
      - Output MUST be in English
      - Use ATTRIBUTE_NAME exactly as provided (case-sensitive).
      - ATTRIBUTE_VALUE must be UPPERCASE
      - ATTRIBUTE_VALUE must include units WITHOUT SPACE
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
          "COMMODITY": "<COMMODITY_CODE>"
          "EXPLANATION": "<EXPLANATION"
        }
      }

    `;

    // console.log(systemPrompt);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(material_name) },
      ],
      temperature: 0.0,
    });

    const processedData = completion.choices[0].message.content;
    // console.log(processedData);

    if (!processedData) {
      return NextResponse.json(
        { error: "No response from Enrichment AI" },
        { status: 500 },
      );
    }

    try {
      const result = JSON.parse(processedData);
      return NextResponse.json(result);
    } catch (parseError) {
      console.error("Error parsing secondary AI response:", parseError);
      return NextResponse.json(
        { error: "Failed to process enrichment data" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error fetching material categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch material categories" },
      { status: 500 },
    );
  }
}
