import { NextRequest } from "next/server";
import { POST as generateDiagramPost } from "@/app/api/ai/generate-diagram/route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return generateDiagramPost(req);
}
