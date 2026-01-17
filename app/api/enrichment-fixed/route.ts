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

    // console.log(attributeNames);

    // FIRST AI processing: breakdown attribute data
    const systemPrompt = `You are an expert material master data engineer.

        Your task is to normalize and ENRICH a material name into structured attribute–attribute_value pairs.

        INPUT:
        - material_name: ${material_name}

        OBJECTIVE:
        1. define and extract techincal attributes based on ${attributeNames}
        2. Analyze the material name.
        3. Extract attributes using:
            a. Explicit information clearly stated in the material name.
            b. Implicit information that is industry-standard and directly derivable from:
            - Bearing codes
            - Part numbering conventions
            - International standards (ISO, DIN, ANSI, JIS)
            - Common engineering rules for mechanical components
        
        OUTPUT RULES:
            - Output MUST be valid JSON only.
            - Do NOT include markdown, comments, or explanation.
            - Output MUST be a SINGLE flat JSON object.
            - Each ATTRIBUTE_NAME MUST be a direct key of the root JSON object.
            - Do NOT wrap attributes in an array.
            - Do NOT nest objects.
            - Use ATTRIBUTE_NAME exactly as provided (case-sensitive).
            - ATTRIBUTE_VALUE MUST BE UPPERCASE
            - ATTRIBUTE_VALUE include units without SPACE
            - If an attribute has no value, set it to null.
            - DO NOT include the following ATTRIBUTE_NAME fields in the output:
                - NOUN
                - MODIFIER
                - MODIFIER_1
                - MODIFIER_2
                - MODIFIER_3

            JSON MUST follow EXACTLY this schema:

            {
            "<ATTRIBUTE_NAME>": "<ATTRIBUTE_VALUE or null>"
            }
        `;
    // console.log(systemPrompt);

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(material_name) },
      ],
      temperature: 0.1,
    });

    const processedData = completion.choices[0].message.content;
    // console.log(processedData);

    if (!processedData) {
      return NextResponse.json(
        { error: "No response from Enrichment AI" },
        { status: 500 }
      );
    }

    try {
      const result = JSON.parse(processedData);
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
