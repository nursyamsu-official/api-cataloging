import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const material_name = url.searchParams.get("material_name");

  if (!material_name) {
    return NextResponse.json(
      { error: "Missing required parameters: material_name" },
      { status: 400 }
    );
  }

  try {
    // FIRST AI processing: breakdown attribute data
    const systemPrompt = `You are a material data normalization engine.

Your task is to analyze a single material name string and decompose it into structured attribute–attribute_value pairs.

INPUT:
- Material Name: a single string describing a material (may include type, size, standard, brand, model, code, specification, etc.)

OBJECTIVE:
1. Parse and understand the material name.
2. Identify all attributes that are explicitly or implicitly present.
3. For each identified attribute, create a single key–value pair where:
   - key   = ATTRIBUTE_NAME
   - value = ATTRIBUTE_VALUE
4. Only include attributes that can be confidently identified.
5. Do NOT guess, infer, or fabricate values.

ATTRIBUTE RULES:
- ATTRIBUTE_NAME:
  - Must be UPPERCASE
  - Must use SNAKE_CASE
  - Must be generic and reusable across materials
- ATTRIBUTE_VALUE:
  - Must preserve the original meaning
  - Normalize to UPPERCASE
  - Trim unnecessary characters
  - Include units if present (MM, INCH, DEG, RPM, etc.)
- If an attribute appears multiple times, use the most specific value.
- Do NOT duplicate attributes.

COMMON ATTRIBUTE NAMES (use only if applicable):
- MATERIAL_TYPE
- BEARING_TYPE
- PART_NUMBER
- STANDARD
- BRAND
- MODEL
- SIZE
- INNER_DIAMETER
- OUTER_DIAMETER
- WIDTH
- LENGTH
- DIAMETER
- THICKNESS
- PRESSURE_RATING
- TEMPERATURE_RATING
- VOLTAGE
- POWER
- SPEED
- COLOR
- GRADE
- FINISH
- APPLICATION

OUTPUT RULES:
- Output MUST be valid JSON only.
- Do NOT include markdown, comments, or explanation.
- JSON structure MUST exactly follow this schema:

{
  "material_name": "<original material name>",
  "attributes": [
    {
      "<ATTRIBUTE_NAME>": "<ATTRIBUTE_VALUE>"
    }
  ]
}

- Each attribute MUST be its own object inside the attributes array.
- If no attributes are identified, return an empty array for attributes.
- Attribute order should follow logical importance:
  material type → standard/model → size/specification → others.

QUALITY CONSTRAINTS:
- Deterministic: same input produces the same output.
- Precise and concise.
- Production-safe output.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(material_name) },
      ],
    });

    const processedData = completion.choices[0].message.content;

    if (!processedData) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    try {
      const result = JSON.parse(processedData);
      return NextResponse.json(result);
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      return NextResponse.json(
        { error: "Failed to process enrichment data" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error processing material:", error);
    return NextResponse.json(
      { error: "Failed to process material" },
      { status: 500 }
    );
  }
}
