import { NextResponse } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../../lib/prisma";

const SOURCE = "https://mmkai.ptsisi.id/api/material_categories/";

const UPSERT_BATCH = 20;

type MaterialCategoryRow = {
  id: string;
  material_category: string;
  status?: string | null;
  attributes: unknown;
};

type MaterialCategoriesPage = {
  recordsTotal?: number;
  page: number;
  per_page?: number;
  total_pages: number;
  data: MaterialCategoryRow[];
};

function toJsonAttributes(
  value: unknown
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
}

async function upsertBatch(items: MaterialCategoryRow[]) {
  for (let i = 0; i < items.length; i += UPSERT_BATCH) {
    const chunk = items.slice(i, i + UPSERT_BATCH);
    await Promise.all(
      chunk.map((item) =>
        prisma.materialCategory.upsert({
          where: { id: item.id },
          create: {
            id: item.id,
            material_category: item.material_category,
            status: item.status ?? null,
            attributes: toJsonAttributes(item.attributes),
          },
          update: {
            material_category: item.material_category,
            status: item.status ?? null,
            attributes: toJsonAttributes(item.attributes),
          },
        })
      )
    );
  }
}

export async function POST() {
  try {
    let pagesProcessed = 0;
    let rowsUpserted = 0;
    let totalPages = 1;
    let page = 1;

    while (page <= totalPages) {
      const url = new URL(SOURCE);
      url.searchParams.set("page", String(page));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Upstream HTTP ${response.status}`);
      }

      const json = (await response.json()) as MaterialCategoriesPage;
      totalPages = Math.max(1, json.total_pages ?? 1);
      const rows = Array.isArray(json.data) ? json.data : [];

      if (rows.length === 0) {
        break;
      }

      await upsertBatch(rows);
      rowsUpserted += rows.length;
      pagesProcessed += 1;
      page += 1;
    }

    return NextResponse.json({
      ok: true,
      pagesProcessed,
      rowsUpserted,
    });
  } catch (error) {
    console.error("material-category-insert:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to sync material categories" },
      { status: 500 }
    );
  }
}
