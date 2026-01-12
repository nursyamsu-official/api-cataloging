import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category_code = url.searchParams.get("category_code");
  const material_name = url.searchParams.get("material_name");
  return handleRequest(category_code, material_name);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const category_code = body.category_code;
  const material_name = body.material_name;
  return handleRequest(category_code, material_name);
}

async function handleRequest(
  category_code: string | null,
  material_name: string | null
) {
  if (!category_code || !material_name || material_name.trim() === "") {
    return NextResponse.json(
      { error: "Missing or invalid material_name parameter" },
      { status: 400 }
    );
  }

  try {
    let fetchUrl = "https://mmkai.ptsisi.id/api/material_categories/get";
    if (category_code) {
      fetchUrl += `?id=${category_code}`;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // FIRST AI processing
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

    // SECONDARY AI processing
    const secondaryPrompt = `You are a material enrichment assistant.

You receive:
- Categories: a plain text list of ATTRIBUTE_NAME: values
- Material Name: a string

Produce a JSON array containing exactly one object.

Retain NOUN and MODIFIER if exist, DO NOT CHANGED

Then, for each ATTRIBUTE_NAME in the Categories:
- Standardized Material Name then desctructure based on function or purpose.
- Analyze the Material Name then map to match a value for that attribute.
- If a suitable value can be extracted or matched from the Material Name, set the attribute value to that extracted value (apply standard naming conventions like capitalizing words).
- If no suitable value can be extracted or matched, set the attribute value to "NOT_FOUND".

Do not add extra attributes beyond those in the Categories list
output alway UPPERCASE

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
