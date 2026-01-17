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

    return NextResponse.json(attributeNames);
  } catch (error) {
    console.error("Error fetching material categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch material categories" },
      { status: 500 }
    );
  }
}
