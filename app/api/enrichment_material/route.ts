import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category_code = url.searchParams.get("category_code");
  const material_name = url.searchParams.get("material_name");

  if (!category_code || !material_name) {
    return NextResponse.json(
      { error: "Missing required parameters: category_code and material_name" },
      { status: 400 }
    );
  }

  try {
    const fetchUrl = `https://mmkai.ptsisi.id/api/material_categories/get?id=${category_code}`;
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // FIRST AI processing: normalize category data
    const systemPrompt = `You are a data normalization engine.

Your task is to transform structured JSON material data into a clean, human-readable attribute list.

Rules:
1. Output must be plain text (no JSON, no markdown).
2. Each attribute must be on a new line.
3. Format:
   ATTRIBUTE_NAME: value1, value2, value3
4. ATTRIBUTE_NAME must be:
   - Uppercase
   - No spaces before or after colon

5. Use ONLY the "value" field.
   - Ignore "abbreviation"
   - Ignore "no"
6. If attribute contains:
   - "attribute_value" → use its value
   - "attribute_values" → join all values with comma
7. Preserve original order of attributes.
8. Do not invent or remove data.
9. Do not explain anything.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(data) },
      ],
    });

    const processedData = completion.choices[0].message.content;

    // SECONDARY AI processing: assign material_name to suitable category
    const secondaryPrompt = `You are a material enrichment assistant.

You receive:
- Categories: a plain text list of ATTRIBUTE_NAME: values
- Material Name: a string

Produce a JSON array containing exactly one object.

1. Destructure and analyze the Material Name.
2. Assign the destructured values to suitable categories (attributes).

Rules:
1. Output MUST be valid JSON only (no markdown, no explanation).
2. Output format and field names MUST exactly match the schema provided.
3. For material_category, status and NOUN DO NOT CHANGED
4. Use values ONLY if they are:
   - Explicitly mentioned in material_name, OR
   - A clear semantic equivalent with the SAME meaning and specification 
     (e.g. "I5" → "INTEL CORE I5").
5. DO NOT infer, upgrade, downgrade, approximate, or guess specifications.
   - Numeric values MUST match exactly (e.g. 4GB ≠ 8GB ≠ 16GB).
   - If material_name contains e.g. "4 GB" and available options are "8GB DDR4" or "128GB DDR4",
     the result MUST be "NOT_FOUND".
6. "Best match" means the most accurate EXACT or SEMANTICALLY EQUIVALENT match,
   NOT the closest, higher, lower, or similar specification.
7. If no confident exact or equivalent match exists, output "NOT_FOUND".
8. Do NOT invent new values.
9. Normalize text:
   - Uppercase
   - Trim spaces
   - Use commas consistently
10. If INPUT_TEXT contains a value not listed in ATTRIBUTE_MASTER, still output it if clearly stated (e.g. OS = UBUNTU).
11. Always return the result as a JSON array with exactly ONE object.
12. Do not add extra attributes beyond those in the Categories list.
13. If a numeric value (e.g. memory size, capacity, speed) is explicitly stated in material_name,
    you MUST return that exact value, even if it does NOT exist in ATTRIBUTE_MASTER.
    You are STRICTLY FORBIDDEN from replacing it with any available option from ATTRIBUTE_MASTER
    that has a different numeric value.
14. Unit normalization (e.g. INCHI → IN, INCH → IN) is allowed
    ONLY if the numeric value remains EXACTLY the same.

Do not add extra attributes beyond those in the Categories list.
Output only the JSON array, no other text.`;

    const secondaryCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: secondaryPrompt },
        {
          role: "user",
          content: `Categories:\n${processedData}\n\nMaterial Name: ${material_name}`,
        },
      ],
    });

    const secondaryData = secondaryCompletion.choices[0].message.content;

    if (!secondaryData) {
      return NextResponse.json(
        { error: "No response from enrichment AI" },
        { status: 500 }
      );
    }

    try {
      const result = JSON.parse(secondaryData);
      return NextResponse.json(result);
    } catch (parseError) {
      console.error("Error parsing secondary AI response:", parseError);
      return NextResponse.json(
        { error: "Failed to process enrichment data" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error fetching or processing material categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch or process material categories" },
      { status: 500 }
    );
  }
}
