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
      { status: 400 }
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
        (item) => item.attribute_name
      );
    } else if (data && data.data && Array.isArray(data.data.attributes)) {
      attributeNames = (data.data.attributes as Attribute[]).map(
        (item) => item.attribute_name
      );
    } else if (data && Array.isArray(data.attributes)) {
      attributeNames = (data.attributes as Attribute[]).map(
        (item) => item.attribute_name
      );
    } else if (data && Array.isArray(data.attribute_name)) {
      attributeNames = data.attribute_name as string[];
    } else {
      return NextResponse.json(
        {
          error: "Invalid data format",
        },
        { status: 500 }
      );
    }

    console.log(attributeNames);

    // FIRST AI processing: breakdown attribute data
    const systemPrompt = `You are an expert material master data engineer.

        Your task is to normalize and ENRICH a material name into structured attribute–attribute_value pairs.

        INPUT:
        - material_name: ${material_name}

        OBJECTIVE:
        1. Analyze the material name.
        2. Identify:
        a. Explicit attributes (clearly written).
        b. Implicit technical attributes that are INDUSTRY-STANDARD and DIRECTLY DERIVABLE
            from known material codes, types, or nomenclature.
        3. Expand attributes as much as possible WITHOUT guessing or fabricating.
        4. Prefer standardized technical attributes over generic labels.

        CRITICAL ENRICHMENT RULES:
        - DO NOT stop at PART_NUMBER if the material code is a recognized industry code
        (e.g., bearing series, bolt grades, pipe schedules, electrical ratings).
       - Extract ALL technical attributes from the material code if it is a recognized industry code.

        ATTRIBUTE RULES:
        - ATTRIBUTE_NAME:
        - UPPERCASE
        - SNAKE_CASE
        - Technical and reusable
        - ATTRIBUTE_VALUE:
        - UPPERCASE
        - Include units
        - NO SPACE
        - Use standard technical terms
        - Each attribute must be placed in its own object.
        - Do NOT duplicate attributes.
        
        OUTPUT RULES:
        - Output MUST be valid JSON only.
        - Do NOT include markdown, comments, or explanation.
        - JSON MUST follow EXACTLY this schema:

        {
        "attributes": [
            {
            "<ATTRIBUTE_NAME>": "<ATTRIBUTE_VALUE>"
            }
        ]
        }


        `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(material_name) },
      ],
      temperature: 0.0,
    });

    const processedData = completion.choices[0].message.content;
    console.log(processedData);

    // SECONDARY AI processing: assign processedData to suitable category code
    // const secondaryPrompt = `you are senior cataloger.
    // mapping ${processedData} into appropriate ${attributeNames}.
    // REMAIN value of "NOUN" and "MODIFIER" attributeNames.`;

    const secondaryPrompt = `
        KEEP all fields from ${attributeNames} and PRESERVE their original order.

        Map each value from processedData into the most appropriate ATTRIBUTE_NAME
        from attributeNames.

        If no appropriate value exists for an ATTRIBUTE_NAME, set its value to null.

        DO NOT include the following ATTRIBUTE_NAME fields in the output:
        - NOUN
        - MODIFIER
        - MODIFIER_1
        - MODIFIER_2
        - MODIFIER_3

   `;

    const secondaryCompletion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: secondaryPrompt },
        {
          role: "user",
          content: JSON.stringify(processedData),
          //   content: `Categories:\n${processedData}\n\nMaterial Name: ${material_name}`,
        },
      ],
      temperature: 0.0,
    });

    const secondaryData = secondaryCompletion.choices[0].message.content;

    if (!secondaryData) {
      return NextResponse.json(
        { error: "No response from Enrichment AI" },
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
    console.error("Error fetching material categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch material categories" },
      { status: 500 }
    );
  }
}
