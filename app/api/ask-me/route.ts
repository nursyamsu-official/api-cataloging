import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const explain = url.searchParams.get("explain");

  if (!explain) {
    return NextResponse.json(
      { error: "Missing required parameters: explain" },
      { status: 400 },
    );
  }

  try {
    const systemPrompt = `You are an AI assistant that explains concepts clearly and concisely.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2-2025-12-11",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: explain },
      ],
      temperature: 0.1,
    });

    const processedData = completion.choices[0].message.content;

    if (!processedData) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 },
      );
    }

    // Assuming the response is plain text, return it directly
    return NextResponse.json({ explanation: processedData });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
