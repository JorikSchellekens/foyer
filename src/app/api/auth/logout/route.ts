import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { originFromRequest } from "@/lib/origin";

export async function POST(req: NextRequest) {
  await destroySession();
  return NextResponse.redirect(`${originFromRequest(req)}/login`, {
    status: 303,
  });
}
