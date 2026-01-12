import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const category_code = url.searchParams.get("category_code");

    let fetchUrl = "https://mmkai.ptsisi.id/api/material_categories/get";
    if (category_code) {
      fetchUrl += `?id=${category_code}`;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // AI processing
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
    return new NextResponse(processedData, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Error fetching or processing material categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch or process material categories" },
      { status: 500 }
    );
  }
}
